/**
 * @fileoverview Buy Executor Service for Solana Memecoin Sniping Bot
 * Subscribes to potential buy opportunities from Redis, constructs and executes
 * swap transactions with high priority fees and custom slippage settings.
 */

const Redis = require('ioredis');
const {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  getAccount
} = require('@solana/spl-token');
const { getConnection } = require('../../../shared/connection');
const { loadWallet } = require('../../../shared/wallet');
const { createLogger, createTransactionLogger } = require('../../../shared/logger');
const config = require('../../../shared/config');
const { REDIS_CHANNELS, SOLANA_ADDRESSES } = require('../../../shared/constants');

// Initialize loggers
const logger = createLogger('buy-executor');
const txLogger = createTransactionLogger('buy-executor');

// Initialize Redis clients
const redisSubscriber = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || '',
  retryStrategy: times => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms`);
    return delay;
  }
});

const redisPublisher = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || ''
});

/**
 * Creates a unique transaction ID for tracking purposes
 * @returns {string} Transaction ID
 */
function createTransactionId() {
  return `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Checks if the Associated Token Account exists for a given mint
 * If not, creates an instruction to create it
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} ownerPubkey - Owner's public key
 * @param {PublicKey} mintPubkey - Token mint public key
 * @returns {Promise<{exists: boolean, address: PublicKey, createInstruction: TransactionInstruction|null}>}
 */
async function checkAndCreateATA(connection, ownerPubkey, mintPubkey) {
  const ataAddress = await getAssociatedTokenAddress(
    mintPubkey,
    ownerPubkey,
    false // allowOwnerOffCurve
  );
  
  try {
    // Check if the ATA already exists
    await getAccount(connection, ataAddress);
    return {
      exists: true,
      address: ataAddress,
      createInstruction: null
    };
  } catch (error) {
    // If error is account not found, create instruction to create ATA
    if (error.name === 'TokenAccountNotFoundError') {
      const createInstruction = createAssociatedTokenAccountInstruction(
        ownerPubkey, // payer
        ataAddress, // associatedToken
        ownerPubkey, // owner
        mintPubkey  // mint
      );
      
      return {
        exists: false,
        address: ataAddress,
        createInstruction
      };
    }
    
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Builds swap instructions for Raydium DEX
 * This is a simplified implementation - in production, use DEX-specific SDKs
 * @param {PublicKey} ownerPubkey - Owner's public key
 * @param {PublicKey} poolPubkey - Liquidity pool public key
 * @param {PublicKey} baseMintPubkey - Base token mint public key
 * @param {PublicKey} quoteMintPubkey - Quote token mint public key
 * @param {PublicKey} baseTokenAccount - Base token associated account
 * @param {PublicKey} quoteTokenAccount - Quote token associated account
 * @param {number} amountIn - Input amount in lamports
 * @param {number} minAmountOut - Minimum output amount with slippage
 * @returns {TransactionInstruction} Swap instruction
 */
function buildRaydiumSwapInstruction(
  ownerPubkey,
  poolPubkey,
  baseMintPubkey,
  quoteMintPubkey,
  baseTokenAccount,
  quoteTokenAccount,
  amountIn,
  minAmountOut
) {
  // In a real implementation, you would use Raydium's SDK or construct the
  // raw instruction with the proper accounts and data
  // This is simplified for this example
  
  // Example structure of a swap instruction (pseudocode)
  // Actual implementation would involve proper buffer encoding and program IDs
  
  /*
  return new TransactionInstruction({
    keys: [
      { pubkey: poolPubkey, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: false },
      { pubkey: baseTokenAccount, isSigner: false, isWritable: true },
      { pubkey: quoteTokenAccount, isSigner: false, isWritable: true },
      ... other required accounts ...
    ],
    programId: RAYDIUM_SWAP_PROGRAM_ID,
    data: Buffer.from(... encoded instruction data ...)
  });
  */
  
  // For this example, since we can't include the full Raydium SDK,
  // we'll just log what would happen and return a dummy instruction
  logger.info(`Would build Raydium swap with: Amount In=${amountIn}, Min Out=${minAmountOut}`);
  
  // In production, replace with actual instruction building
  return SystemProgram.transfer({
    fromPubkey: ownerPubkey,
    toPubkey: ownerPubkey,
    lamports: 0 // Dummy instruction
  });
}

/**
 * Executes a swap transaction to buy a token
 * @param {Object} tokenData - Data about the token to buy
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
 */
async function executeSwap(tokenData) {
  const txId = createTransactionId();
  const { baseMint, quoteMint, lpAddress } = tokenData;
  
  txLogger.info(`Starting swap transaction`, { txId, baseMint, quoteMint, lpAddress });
  
  try {
    // Get connection and wallet
    const connection = await getConnection();
    const wallet = loadWallet();
    const walletPubkey = wallet.publicKey;
    
    // Parse mint addresses
    const baseMintPubkey = new PublicKey(baseMint);
    const quoteMintPubkey = new PublicKey(quoteMint);
    const lpAddressPubkey = new PublicKey(lpAddress);
    
    // Calculate amount in SOL to spend
    const amountInSol = config.BUY_AMOUNT_SOL;
    const amountInLamports = amountInSol * LAMPORTS_PER_SOL;
    
    txLogger.info(`Transaction parameters prepared`, { 
      txId, 
      wallet: walletPubkey.toString(),
      amountInSol
    });
    
    // Check if we need to create Associated Token Accounts
    txLogger.debug(`Checking token accounts`, { txId });
    
    const baseATA = await checkAndCreateATA(connection, walletPubkey, baseMintPubkey);
    const quoteATA = await checkAndCreateATA(connection, walletPubkey, quoteMintPubkey);
    
    txLogger.debug(`Token account status`, { 
      txId, 
      baseATA: baseATA.exists ? 'exists' : 'needs creation',
      quoteATA: quoteATA.exists ? 'exists' : 'needs creation'
    });
    
    // Prepare transaction instructions
    const instructions = [];
    
    // Add compute budget instructions to set priority fee
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: config.COMPUTE_UNITS_LIMIT })
    );
    
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: config.PRIORITY_FEE_MICRO_LAMPORTS 
      })
    );
    
    // Create ATAs if needed
    if (baseATA.createInstruction) {
      instructions.push(baseATA.createInstruction);
      txLogger.debug(`Adding instruction to create base token ATA`, { txId });
    }
    
    if (quoteATA.createInstruction) {
      instructions.push(quoteATA.createInstruction);
      txLogger.debug(`Adding instruction to create quote token ATA`, { txId });
    }
    
    // Calculate minimum output amount with slippage
    // In a real implementation, this would involve querying the pool for the current price
    // and applying the slippage percentage
    const minAmountOut = 1; // Dummy value for this example
    
    // Build swap instruction (would use DEX SDK in production)
    const swapInstruction = buildRaydiumSwapInstruction(
      walletPubkey,
      lpAddressPubkey,
      baseMintPubkey,
      quoteMintPubkey,
      baseATA.address,
      quoteATA.address,
      amountInLamports,
      minAmountOut
    );
    
    instructions.push(swapInstruction);
    txLogger.debug(`Added swap instruction`, { txId });
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({ 
      commitment: config.SOLANA_COMMITMENT 
    });
    
    // Create versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    
    // Sign transaction
    transaction.sign([wallet]);
    txLogger.info(`Transaction signed`, { txId, blockhash });
    
    // Send transaction with preflight checks disabled for speed
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3
    });
    
    txLogger.info(`Transaction sent`, { txId, signature });
    
    // Wait for confirmation
    const confirmationStrategy = {
      signature: signature,
      lastValidBlockHeight,
      blockhash
    };
    
    txLogger.info(`Awaiting confirmation`, { txId, signature });
    
    const confirmation = await connection.confirmTransaction(confirmationStrategy, config.SOLANA_COMMITMENT);
    
    if (confirmation.value.err) {
      txLogger.error(`Transaction confirmed with error`, { 
        txId, 
        signature, 
        error: JSON.stringify(confirmation.value.err) 
      });
      
      return {
        success: false,
        signature,
        error: JSON.stringify(confirmation.value.err)
      };
    }
    
    txLogger.info(`Transaction confirmed successfully`, { txId, signature });
    
    // Publish successful buy to Redis
    const buyData = {
      txId,
      signature,
      baseMint,
      quoteMint,
      lpAddress,
      amountInSol,
      timestamp: Date.now(),
      // In a real implementation, fetch the actual amount of tokens received
      // by querying the token account after the transaction
      tokenAmount: 0 // Placeholder
    };
    
    await redisPublisher.publish(
      REDIS_CHANNELS.SUCCESSFUL_BUYS,
      JSON.stringify(buyData)
    );
    
    // Also store in Redis for the sell-manager to pick up
    await redisPublisher.hset(`positions:${baseMint}`, {
      baseMint,
      buyPrice: 0, // Would calculate actual price in production
      amountInSol,
      buyTimestamp: Date.now(),
      signature
    });
    
    // Increment buy stats counter
    await redisPublisher.incr('stats:buy_count');
    
    return {
      success: true,
      signature,
      buyData
    };
  } catch (error) {
    txLogger.error(`Swap execution failed`, { 
      txId, 
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Processes a potential buy notification from Redis
 * @param {string} message - JSON string containing token data
 */
async function processPotentialBuy(message) {
  try {
    const tokenData = JSON.parse(message);
    logger.info(`Processing potential buy: ${tokenData.baseMint}`);
    
    // Check quote token - we usually only want SOL pairs for simplicity
    const isSOLPair = tokenData.quoteMint === SOLANA_ADDRESSES.SOL_MINT.toString();
    if (!isSOLPair) {
      logger.warn(`Skipping non-SOL pair: ${tokenData.quoteMint}`);
      return;
    }
    
    // Execute the swap
    const result = await executeSwap(tokenData);
    
    if (result.success) {
      logger.info(`Successfully bought ${tokenData.baseMint}`, { 
        signature: result.signature 
      });
    } else {
      logger.error(`Failed to buy ${tokenData.baseMint}`, { 
        error: result.error 
      });
    }
  } catch (error) {
    logger.error(`Error processing potential buy: ${error.message}`);
  }
}

// Set up Redis subscription
redisSubscriber.on('ready', () => {
  logger.info('Redis subscriber connected. Subscribing to potential buys channel.');
  redisSubscriber.subscribe(REDIS_CHANNELS.POTENTIAL_BUYS);
});

redisSubscriber.on('message', (channel, message) => {
  if (channel === REDIS_CHANNELS.POTENTIAL_BUYS) {
    processPotentialBuy(message);
  }
});

redisSubscriber.on('error', (error) => {
  logger.error(`Redis subscriber error: ${error.message}`);
});

// Set up heartbeat interval
const heartbeatInterval = setInterval(async () => {
  try {
    const timestamp = Date.now();
    await redisPublisher.set('heartbeat:buy-executor', timestamp);
    await redisPublisher.publish(REDIS_CHANNELS.HEARTBEATS, JSON.stringify({
      service: 'buy-executor',
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

logger.info('Buy Executor service started');