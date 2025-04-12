/**
 * @fileoverview Token Filter Service for Solana Memecoin Sniping Bot
 * Subscribes to Redis notifications about new liquidity pools,
 * performs filtering checks on tokens, and publishes potential
 * buy opportunities to the appropriate Redis channel.
 */

const Redis = require('ioredis');
const { PublicKey, TOKEN_PROGRAM_ID } = require('@solana/web3.js');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');
const { getConnection } = require('shared/connection');
const { createLogger } = require('shared/logger');
const config = require('shared/config').default;
const { REDIS_CHANNELS, SOLANA_ADDRESSES, KNOWN_TOKENS, REGEX_PATTERNS } = require('shared/constants');

// Initialize logger
const logger = createLogger('token-filter');
const LAMPORTS_PER_SOL = 1000000000;

// Initialize Redis clients
const redisSubscriber = createSubscriber('token-filter');
const redisPublisher = createPublisher('token-filter');

/**
 * Validates that an input string is a valid Solana address
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidSolanaAddress(address) {
  try {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check if it matches the expected format
    if (!REGEX_PATTERNS.SOLANA_ADDRESS.test(address)) {
      return false;
    }
    
    // Try to create a PublicKey (will throw if invalid)
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Attempts to fetch token metadata from Metaplex
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<Object|null>} - Token metadata or null if not found
 */
async function getTokenMetadata(mintAddress) {
  try {
    const connection = await getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get PDA for metadata
    const [metadataPDA] = await PublicKey.findProgramAddress(
      [Buffer.from('metadata'), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s') // Metadata program ID
    );
    
    // Fetch the metadata account
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    if (!metadataAccount) {
      logger.debug(`No metadata found for mint: ${mintAddress}`);
      return null;
    }
    
    // Decode the metadata
    const metadata = Metadata.deserialize(metadataAccount.data);
    
    logger.debug(`Found metadata for ${mintAddress}: Name=${metadata.data.name}, Symbol=${metadata.data.symbol}`);
    
    return {
      name: metadata.data.name.replace(/\0/g, '').trim(),
      symbol: metadata.data.symbol.replace(/\0/g, '').trim(),
      uri: metadata.data.uri.replace(/\0/g, '').trim()
    };
  } catch (error) {
    logger.debug(`Error fetching metadata for ${mintAddress}: ${error.message}`);
    return null;
  }
}

/**
 * Checks token for potential rug pull indicators
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<Object>} - Results of various security checks
 */
async function checkTokenSecurity(mintAddress) {
  try {
    const connection = await getConnection();
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get the token mint account
    const mintAccount = await connection.getAccountInfo(mintPubkey);
    if (!mintAccount) {
      return { valid: false, reason: 'Mint account not found' };
    }
    
    // Check if it's a known trusted token
    if (KNOWN_TOKENS[mintAddress]) {
      return { 
        valid: true, 
        isKnownToken: true,
        name: KNOWN_TOKENS[mintAddress]
      };
    }
    
    // Parse mint data to check authorities
    // This is simplified, in production you'd use proper layout parsing
    // For full implementation, use @solana/spl-token parseTokenAccountData
    const mintAuthority = mintAccount.data.slice(0, 32);
    const freezeAuthorityEnabled = mintAccount.data[36]; // Check for freeze authority
    
    const mintAuthorityExists = !mintAuthority.every(byte => byte === 0);
    
    return {
      valid: true,
      hasMintAuthority: mintAuthorityExists,
      hasFreezeAuthority: freezeAuthorityEnabled === 1,
      isKnownToken: false
    };
  } catch (error) {
    logger.error(`Error checking token security for ${mintAddress}: ${error.message}`);
    return { valid: false, reason: error.message };
  }
}

/**
 * Checks liquidity pool size
 * @param {string} lpAddress - Liquidity pool address
 * @param {string} quoteMint - Quote token mint (e.g., SOL)
 * @returns {Promise<Object>} - Results of liquidity check
 */
async function checkPoolLiquidity(lpAddress, quoteMint) {
  try {
    // For SOL pairs, we can estimate by checking LP account balance
    if (quoteMint === SOLANA_ADDRESSES.SOL_MINT.toString()) {
      const connection = await getConnection();
      const lpPubkey = new PublicKey(lpAddress);
      
      // Get LP account SOL balance
      const balance = await connection.getBalance(lpPubkey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      
      logger.debug(`LP ${lpAddress} has approximately ${solBalance} SOL`);
      
      return {
        valid: solBalance >= config.MIN_POOL_SIZE_SOL,
        liquidity: solBalance,
        reason: solBalance < config.MIN_POOL_SIZE_SOL ? 
          `Insufficient liquidity: ${solBalance} SOL (min: ${config.MIN_POOL_SIZE_SOL})` : 
          null
      };
    }
    
    // For non-SOL pairs, this would require more complex DEX-specific logic
    // This is simplified - in production you would fetch the pool's token amounts
    logger.debug(`Non-SOL quote mint, skipping detailed liquidity check`);
    return { valid: true, liquidity: null };
  } catch (error) {
    logger.error(`Error checking pool liquidity for ${lpAddress}: ${error.message}`);
    return { valid: false, reason: error.message };
  }
}

/**
 * Main function to filter and analyze a newly detected liquidity pool
 * @param {Object} poolData - Data about the new pool
 * @returns {Promise<boolean>} - True if token passes all filters
 */
async function filterToken(poolData) {
  const { baseMint, quoteMint, lpAddress } = poolData;
  
  logger.info(`Filtering token: ${baseMint} (Pool: ${lpAddress})`);
  
  // Validate inputs
  if (!isValidSolanaAddress(baseMint) || !isValidSolanaAddress(quoteMint) || !isValidSolanaAddress(lpAddress)) {
    logger.warn(`Invalid addresses in pool data: Base=${baseMint}, Quote=${quoteMint}, LP=${lpAddress}`);
    return false;
  }
  
  // Skip if base is a known token (we're looking for new tokens)
  if (KNOWN_TOKENS[baseMint]) {
    logger.debug(`Skipping known token: ${KNOWN_TOKENS[baseMint]} (${baseMint})`);
    return false;
  }
  
  // Check token security (mint authority, etc.)
  const securityCheck = await checkTokenSecurity(baseMint);
  if (!securityCheck.valid) {
    logger.warn(`Token ${baseMint} failed security check: ${securityCheck.reason}`);
    return false;
  }
  
  // Log security warnings but don't automatically filter out
  if (securityCheck.hasMintAuthority) {
    logger.warn(`Token ${baseMint} has active mint authority - potential risk`);
  }
  
  if (securityCheck.hasFreezeAuthority) {
    logger.warn(`Token ${baseMint} has freeze authority - potential risk`);
  }
  
  // Check pool liquidity
  const liquidityCheck = await checkPoolLiquidity(lpAddress, quoteMint);
  if (!liquidityCheck.valid) {
    logger.warn(`Pool ${lpAddress} failed liquidity check: ${liquidityCheck.reason}`);
    return false;
  }
  
  // Get token metadata (if available)
  const metadata = await getTokenMetadata(baseMint);
  logger.info(`Token ${baseMint} metadata: ${metadata ? JSON.stringify(metadata) : 'None available'}`);
  
  // If we reach here, token has passed all filters
  logger.info(`Token ${baseMint} passed all filters. Forwarding as potential buy.`);
  return true;
}

/**
 * Processes a new pool notification from Redis
 * @param {string} message - JSON string containing pool data
 */
async function processNewPool(message) {
  try {
    const poolData = JSON.parse(message);
    
    logger.info(`Processing new pool: ${JSON.stringify(poolData)}`);
    
    // Perform filtering checks
    const passedFilters = await filterToken(poolData);
    
    if (passedFilters) {
      // Add metadata if available
      const metadata = await getTokenMetadata(poolData.baseMint);
      if (metadata) {
        poolData.metadata = metadata;
      }
      
      // Publish to potential buys channel
      await redisPublisher.publish(
        REDIS_CHANNELS.POTENTIAL_BUYS,
        JSON.stringify({
          ...poolData,
          timestamp: Date.now()
        })
      );
      
      logger.info(`Published ${poolData.baseMint} to potential buys channel`);
    }
  } catch (error) {
    logger.error(`Error processing new pool: ${error.message}`);
  }
}

// Set up Redis subscription
redisSubscriber.on('ready', () => {
  logger.info('Redis subscriber connected. Subscribing to new pools channel.');
  redisSubscriber.subscribe(REDIS_CHANNELS.NEW_POOLS);
});

redisSubscriber.on('message', (channel, message) => {
  if (channel === REDIS_CHANNELS.NEW_POOLS) {
    processNewPool(message);
  }
});

redisSubscriber.on('error', (error) => {
  logger.error(`Redis subscriber error: ${error.message}`);
});

// Set up heartbeat interval
const heartbeatInterval = setInterval(async () => {
  try {
    const timestamp = Date.now();
    await redisPublisher.set('heartbeat:token-filter', timestamp);
    await redisPublisher.publish(REDIS_CHANNELS.HEARTBEATS, JSON.stringify({
      service: 'token-filter',
      timestamp
    }));
    logger.debug('Heartbeat sent');
  } catch (error) {
    logger.error(`Failed to send heartbeat: ${error.message}`);
  }
}, 10000); // Every 10 seconds

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  clearInterval(heartbeatInterval);
  
  // Close Redis connections
  redisSubscriber.quit();
  redisPublisher.quit();
  
  // Give connections time to close properly
  setTimeout(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  }, 1000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}\n${error.stack}`);
  
  // Exit with error code for container orchestration to restart
  process.exit(1);
});

logger.info('Token Filter service started');
