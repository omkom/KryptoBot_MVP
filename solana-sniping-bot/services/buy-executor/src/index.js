/**
 * @fileoverview Buy Executor Service for Solana Memecoin Sniping Bot
 * Subscribes to potential buy opportunities from Redis, constructs and executes
 * swap transactions with high priority fees and custom slippage settings.
 * Includes DryRun mode for transaction simulation.
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
const { getConnection } = require('shared/connection');
const { loadWallet } = require('shared/wallet');
const { createLogger, createTransactionLogger } = require('shared/logger');
const config = require('shared/config');
const { REDIS_CHANNELS, SOLANA_ADDRESSES } = require('shared/constants');
const { v4: uuidv4 } = require('uuid');

// Initialize loggers
const logger = createLogger('buy-executor');
const txLogger = createTransactionLogger('buy-executor');

// Initialize Redis clients
// Initialize Redis client for subscribing to events
const redisSubscriber = createSubscriber('buy-executor');
const redisPublisher = createPublisher('buy-executor');

/**
 * Creates a unique transaction ID for tracking purposes
 * @returns {string} Transaction ID
 */
function createTransactionId() {
  return `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/**
 * Generates a simulated transaction signature for DryRun mode
 * @returns {string} Simulated transaction signature
 */
function generateSimulatedSignature() {
  // Generate a unique signature-like string for tracking
  const randomBytes = uuidv4().replace(/-/g, '');
  return randomBytes + 'DryRunSim';
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
  // In DryRun mode, simulate the ATA check
  if (config.DRY_RUN) {
    const ataAddress = await getAssociatedTokenAddress(
      mintPubkey,
      ownerPubkey,
      false
    );
    
    // Simulate a 70% chance the ATA already exists
    const exists = Math.random() > 0.3;
    
    logger.debug(`DryRun: Simulating ATA check for ${mintPubkey.toString()}, exists=${exists}`);
    
    if (exists) {
      return {
        exists: true,
        address: ataAddress,
        createInstruction: null
      };
    } else {
      const createInstruction = createAssociatedTokenAccountInstruction(
        ownerPubkey,
        ataAddress,
        ownerPubkey,
        mintPubkey
      );
      
      return {
        exists: false,
        address: ataAddress,
        createInstruction
      };
    }
  }
  
  // Normal mode - actual ATA check
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
  
  // Log what would be built in real scenario
  logger.info(`Would build Raydium swap with: Amount In=${amountIn}, Min Out=${minAmountOut}`);
  
  // In production, replace with actual instruction building
  return SystemProgram.transfer({
    fromPubkey: ownerPubkey,
    toPubkey: ownerPubkey,
    lamports: 0 // Dummy instruction
  });
}

/**
 * Simulates a transaction for DryRun mode
 * @param {string} txId - Transaction ID
 * @param {Object} tokenData - Token data
 * @param {number} amountInSol - SOL amount for the transaction
 * @returns {Promise<{success: boolean, signature: string, error?: string, buyData?: Object}>}
 */
async function simulateTransaction(txId, tokenData, amountInSol) {
  const { baseMint, quoteMint, lpAddress } = tokenData;
  
  txLogger.info(`DryRun: Simulating swap transaction`, { txId, baseMint, quoteMint, lpAddress });
  
  // Generate a transaction signature for tracking
  const signature = generateSimulatedSignature();
  
  // Simulate transaction processing time
  const processingTime = config.DRY_RUN_CONFIRMATION_MS + (Math.random() * 2000);
  txLogger.debug(`DryRun: Simulating processing time of ${processingTime.toFixed(0)}ms`, { txId, signature });
  
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate success/failure based on success rate
  const success = Math.random() * 100 < config.DRY_RUN_SUCCESS_RATE;
  
  if (!success) {
    const errors = [
      'Transaction simulation failed: Error processing Instruction 2: custom program error: 0x1',
      'Blockhash not found',
      'Transaction too large',
      'Insufficient funds for transaction'
    ];
    const randomError = errors[Math.floor(Math.random() * errors.length)];
    
    txLogger.error(`DryRun: Transaction simulation failed`, { 
      txId, 
      signature, 
      error: randomError 
    });
    
    return {
      success: false,
      signature,
      error: randomError
    };
  }
  
  // Simulate token amount received (completely made up for demonstration)
  const tokenAmount = Math.floor(Math.random() * 1000000000) + 100000;
  const estimatedPrice = amountInSol / (tokenAmount / LAMPORTS_PER_SOL);
  
  txLogger.info(`DryRun: Transaction simulation succeeded`, { 
    txId, 
    signature, 
    tokenAmount,
    estimatedPrice
  });
  
  // Prepare buy data for Redis
  const buyData = {
    txId,
    signature,
    baseMint,
    quoteMint,
    lpAddress,
    amountInSol,
    tokenAmount,
    estimatedPrice,
    timestamp: Date.now(),
    isDryRun: true
  };
  
  return {
    success: true,
    signature,
    buyData
  };
}

/**
 * Executes a swap transaction to buy a token
 * @param {Object} tokenData - Data about the token to buy
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
 */
async function executeSwap(tokenData) {
  const txId = createTransactionId();
  const { baseMint, quoteMint, lpAddress } = tokenData;
  
  txLogger.info(`Starting swap transaction`, { 
    txId, 
    baseMint, 
    quoteMint, 
    lpAddress,
    dryRun: config.DRY_RUN
  });
  
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
      amountInSol,
      dryRun: config.DRY_RUN
    });
    
    // If in DryRun mode, simulate the transaction
    if (config.DRY_RUN) {
      const result = await simulateTransaction(txId, tokenData, amountInSol);
      
      // If successful simulation, publish to Redis
      if (result.success) {
        await redisPublisher.publish(
          REDIS_CHANNELS.SUCCESSFUL_BUYS,
          JSON.stringify(result.buyData)
        );
        
        // Store in Redis for the sell-manager
        await redisPublisher.hset(`positions:${baseMint}`, {
          baseMint,
          buyPrice: result.buyData.estimatedPrice || 0,
          amountInSol,
          tokenAmount: result.buyData.tokenAmount || 0,
          buyTimestamp: Date.now(),
          signature: result.signature,
          isDryRun: true
        });
        
        // Increment buy stats counter
        await redisPublisher.incr('stats:buy_count');
      }
      
      return result;
    }
    
    // Normal execution mode from here

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
    
    // Check if we should simulate the transaction
    if (config.SIMULATE_TRANSACTIONS) {
      txLogger.info(`Simulating transaction before sending`, { txId });
      
      try {
        const simulation = await connection.simulateTransaction(instructions);
        
        if (simulation.value.err) {
          txLogger.error(`Transaction simulation failed`, {
            txId,
            error: JSON.stringify(simulation.value.err)
          });
          
          return {
            success: false,
            error: `Simulation failed: ${JSON.stringify(simulation.value.err)}`
          };
        }
        
        txLogger.info(`Transaction simulation successful`, { txId });
      } catch (error) {
        txLogger.error(`Error during transaction simulation`, {
          txId,
          error: error.message
        });
        
        return {
          success: false,
          error: `Simulation error: ${error.message}`
        };
      }
    }
    
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
    
    // Fetch the actual tokens received (simplified - in production would query token balance)
    // This is a placeholder - in a real implementation you'd query the token account
    const tokenAmount = 1000000; // Placeholder
    
    // Publish successful buy to Redis
    const buyData = {
      txId,
      signature,
      baseMint,
      quoteMint,
      lpAddress,
      amountInSol,
      timestamp: Date.now(),
      tokenAmount,
      isDryRun: false
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
      tokenAmount,
      buyTimestamp: Date.now(),
      signature,
      isDryRun: false
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
    logger.info(`Processing potential buy: ${tokenData.baseMint}`, {
      dryRun: config.DRY_RUN
    });
    
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
        signature: result.signature,
        dryRun: config.DRY_RUN
      });
    } else {
      logger.error(`Failed to buy ${tokenData.baseMint}`, { 
        error: result.error,
        dryRun: config.DRY_RUN
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
      timestamp,
      dryRun: config.DRY_RUN
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

logger.info(`Buy Executor service started in ${config.DRY_RUN ? 'DRY RUN' : 'LIVE'} mode`);
