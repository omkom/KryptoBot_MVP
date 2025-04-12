/**
 * @fileoverview Sell Manager Service for Solana Memecoin Sniping Bot
 * Monitors active positions, periodically checks prices, and executes
 * sell transactions based on take-profit and stop-loss conditions.
 * Includes DryRun mode for transaction simulation.
 */

const Redis = require('ioredis');
const {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID 
} = require('@solana/spl-token');
const { getConnection } = require('shared/connection');
const { loadWallet } = require('shared/wallet');
const { createLogger, createTransactionLogger } = require('shared/logger');
const config = require('shared/config');
const { REDIS_CHANNELS, SOLANA_ADDRESSES, PERFORMANCE_SETTINGS } = require('shared/constants');
const { v4: uuidv4 } = require('uuid');

// Initialize loggers
const logger = createLogger('sell-manager');
const txLogger = createTransactionLogger('sell-manager');

// Initialize Redis clients
const redisSubscriber = createSubscriber('buy-executor');
const redisPublisher = createPublisher('buy-executor');

const redisClient = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || ''
});

/**
 * Active positions tracking map
 * Maps token mint address -> position data
 */
const activePositions = new Map();

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
 * Loads active positions from Redis
 * @returns {Promise<void>}
 */
async function loadPositionsFromRedis() {
  try {
    logger.info('Loading active positions from Redis');
    
    // Get all position keys
    const positionKeys = await redisClient.keys('positions:*');
    
    if (positionKeys.length === 0) {
      logger.info('No active positions found in Redis');
      return;
    }
    
    // Process each position
    for (const key of positionKeys) {
      try {
        const positionData = await redisClient.hgetall(key);
        
        if (!positionData || !positionData.baseMint) {
          logger.warn(`Invalid position data for key: ${key}`);
          continue;
        }
        
        // Parse numeric values
        positionData.buyPrice = parseFloat(positionData.buyPrice || '0');
        positionData.amountInSol = parseFloat(positionData.amountInSol || '0');
        positionData.buyTimestamp = parseInt(positionData.buyTimestamp || '0', 10);
        positionData.tokenAmount = parseInt(positionData.tokenAmount || '0', 10);
        positionData.isDryRun = positionData.isDryRun === 'true';
        
        // Add to active positions map
        activePositions.set(positionData.baseMint, positionData);
        
        logger.info(`Loaded position for token ${positionData.baseMint}`, {
          amountInSol: positionData.amountInSol,
          buyTimestamp: new Date(positionData.buyTimestamp).toISOString(),
          isDryRun: positionData.isDryRun
        });
      } catch (error) {
        logger.error(`Error processing position ${key}: ${error.message}`);
      }
    }
    
    logger.info(`Loaded ${activePositions.size} active positions`);
  } catch (error) {
    logger.error(`Failed to load positions from Redis: ${error.message}`);
  }
}

/**
 * Calculates token price from a liquidity pool
 * @param {string} baseMint - Base token mint address
 * @param {string} lpAddress - Liquidity pool address
 * @param {boolean} isDryRun - Whether this is a dry run simulation
 * @returns {Promise<{price: number, liquidity: number} | null>}
 */
async function calculateTokenPrice(baseMint, lpAddress, isDryRun) {
  try {
    logger.debug(`Calculating price for ${baseMint} from pool ${lpAddress}`, { isDryRun });
    
    const position = activePositions.get(baseMint);
    
    if (!position) {
      logger.warn(`No position data for ${baseMint}`);
      return null;
    }
    
    // DryRun mode - simulate realistic price movement
    if (isDryRun || config.DRY_RUN) {
      // Initial price is the buy price or 1.0 if not set
      const initialPrice = position.buyPrice || 1.0;
      
      // Calculate time since buy (in minutes)
      const minutesSinceBuy = (Date.now() - position.buyTimestamp) / (1000 * 60);
      
      // Create semi-realistic price movement based on time
      // Memecoin prices are often volatile in the first hour, then stabilize or decline
      
      let multiplier;
      const randomFactor = (Math.random() * config.DRY_RUN_PRICE_VOLATILITY) / 100;
      
      if (minutesSinceBuy < 10) {
        // First 10 minutes - high volatility up or down
        multiplier = 1 + (Math.random() > 0.5 ? randomFactor * 3 : -randomFactor * 2);
      } else if (minutesSinceBuy < 60) {
        // First hour - gradually trend up with volatility
        multiplier = 1 + ((Math.random() * 1.5) - 0.5) * randomFactor;
      } else {
        // After first hour - gradually trend down with some spikes
        const downwardPressure = Math.min(0.7, minutesSinceBuy / 300); // Max 70% downward trend
        multiplier = 1 + ((Math.random() * 1.2) - downwardPressure) * randomFactor;
      }
      
      // Apply multiplier to current price
      const newPrice = initialPrice * multiplier;
      
      // Simulate some liquidity value
      const liquidity = 5 + (Math.random() * 20);
      
      // Calculate percent change from initial buy price
      const priceChangePercent = ((newPrice / initialPrice) - 1) * 100;
      
      logger.debug(`DryRun: Calculated price for ${baseMint}: ${newPrice.toFixed(8)} SOL/token (change: ${priceChangePercent.toFixed(2)}%), liquidity: ${liquidity.toFixed(2)} SOL`);
      
      return {
        price: newPrice,
        liquidity,
        priceChangePercent
      };
    }
    
    // LIVE mode - fetch real price from blockchain
    const connection = await getConnection();
    
    // In a real implementation, you would:
    // 1. Fetch the pool account data
    // 2. Parse it according to the DEX's data structure
    // 3. Calculate the price based on reserves
    
    // This is a simplified implementation - in production you'd use:
    // - DEX-specific SDKs to get accurate prices
    // - Or parse pool account data manually
    // - Or use a price API service like Jupiter Aggregator or Birdeye
    
    // For this example, we'll simulate by getting a random price
    // with some reasonable parameters to simulate price movement
    
    // Initial price is the buy price or 1.0 if not set
    const initialPrice = position.buyPrice || 1.0;
    
    // Simulate price movement - this would be replaced with real DEX data
    // Generate price movement in a range of -50% to +200% from initial
    const priceMovementPercent = -50 + (Math.random() * 250);
    const newPrice = initialPrice * (1 + (priceMovementPercent / 100));
    
    // Also simulate some liquidity value
    const liquidity = 5 + (Math.random() * 20); // Random SOL amount between 5-25
    
    logger.debug(`Calculated price for ${baseMint}: ${newPrice} SOL/token (movement: ${priceMovementPercent.toFixed(2)}%), liquidity: ${liquidity} SOL`);
    
    return {
      price: newPrice,
      liquidity,
      priceChangePercent: priceMovementPercent
    };
  } catch (error) {
    logger.error(`Error calculating price for ${baseMint}: ${error.message}`);
    return null;
  }
}

/**
 * Builds swap instructions for token selling on Raydium
 * This is a simplified implementation - in production, use DEX-specific SDKs
 * @param {Object} params - Swap parameters
 * @returns {Object} Instructions and related data
 */
function buildSellSwapInstructions(params) {
  const {
    wallet,
    tokenMint,
    lpAddress,
    tokenAmount,
    minSolAmount
  } = params;
  
  // In a real implementation, you would:
  // 1. Use Raydium's SDK to build swap instructions
  // 2. Include proper account setup, swap program ID, etc.
  
  // For this example, we'll just log what would happen
  logger.info(`Would build sell swap for ${tokenAmount} tokens to minimum ${minSolAmount} SOL`);
  
  // This would return the actual instructions in production
  return {
    instructions: [
      // Would include actual swap instructions here
      ComputeBudgetProgram.setComputeUnitLimit({ units: config.COMPUTE_UNITS_LIMIT }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: config.PRIORITY_FEE_MICRO_LAMPORTS })
      // Plus the actual DEX-specific swap instruction
    ],
    tokenAccount: new PublicKey("TokenAccountAddress"),  // This would be the real token account
    accounts: {
      tokenMint: new PublicKey(tokenMint),
      lpAddress: new PublicKey(lpAddress)
    }
  };
}

/**
 * Simulates a sell transaction for DryRun mode
 * @param {string} txId - Transaction ID
 * @param {string} baseMint - Token mint address
 * @param {Object} priceData - Price data 
 * @param {Object} position - Position data
 * @returns {Promise<{success: boolean, signature: string, error?: string, sellData?: Object}>}
 */
async function simulateSellTransaction(txId, baseMint, priceData, position) {
  txLogger.info(`DryRun: Simulating sell transaction`, {
    txId,
    baseMint,
    currentPrice: priceData.price,
    priceChangePercent: priceData.priceChangePercent
  });
  
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
  
  // Calculate profit/loss
  const tokenAmount = position.tokenAmount || 1000000; // Use position data or default
  const expectedSolAmount = tokenAmount * priceData.price / LAMPORTS_PER_SOL;
  const boughtForSol = position.amountInSol;
  const profitLossSol = expectedSolAmount - boughtForSol;
  const profitLossPercent = ((expectedSolAmount / boughtForSol) - 1) * 100;
  
  txLogger.info(`DryRun: Sell transaction successful`, { 
    txId, 
    signature, 
    soldForSol: expectedSolAmount,
    boughtForSol,
    profitLossSol,
    profitLossPercent
  });
  
  // Prepare sell data
  const sellData = {
    txId,
    signature,
    baseMint,
    tokenAmount,
    soldForSol: expectedSolAmount,
    boughtForSol,
    profitLossSol,
    profitLossPercent,
    timestamp: Date.now(),
    isDryRun: true
  };
  
  return {
    success: true,
    signature,
    sellData
  };
}

/**
 * Executes a sell transaction for a token
 * @param {string} baseMint - Base token mint address 
 * @param {Object} priceData - Current price data
 * @param {Object} position - Position data
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>}
 */
async function executeSellTransaction(baseMint, priceData, position) {
  const txId = createTransactionId();
  
  txLogger.info(`Starting sell transaction`, { 
    txId, 
    baseMint, 
    currentPrice: priceData.price,
    buyPrice: position.buyPrice,
    priceChangePercent: priceData.priceChangePercent,
    isDryRun: position.isDryRun || config.DRY_RUN
  });
  
  // If in DryRun mode or position was created in DryRun, simulate the transaction
  if (position.isDryRun || config.DRY_RUN) {
    const result = await simulateSellTransaction(txId, baseMint, priceData, position);
    
    // If successful simulation, publish to Redis and clean up
    if (result.success) {
      await redisClient.publish(
        REDIS_CHANNELS.SUCCESSFUL_SELLS,
        JSON.stringify(result.sellData)
      );
      
      // Remove from active positions in Redis
      await redisClient.del(`positions:${baseMint}`);
      
      // Increment sell stats counter
      await redisClient.incr('stats:sell_count');
    }
    
    return result;
  }
  
  // LIVE mode - execute real transaction
  try {
    // Get connection and wallet
    const connection = await getConnection();
    const wallet = loadWallet();
    
    // Get token ATA (Associated Token Account)
    const tokenMintPubkey = new PublicKey(baseMint);
    const tokenATA = await getAssociatedTokenAddress(
      tokenMintPubkey,
      wallet.publicKey
    );
    
    // Fetch token account to get balance
    let tokenAmount = 0;
    try {
      const tokenAccount = await getAccount(connection, tokenATA);
      tokenAmount = Number(tokenAccount.amount);
      
      txLogger.info(`Found ${tokenAmount} tokens in account`, { txId, baseMint });
      
      if (tokenAmount === 0) {
        txLogger.warn(`No tokens to sell, skipping transaction`, { txId, baseMint });
        return { success: false, error: 'No tokens to sell' };
      }
    } catch (error) {
      txLogger.error(`Failed to fetch token account: ${error.message}`, { txId, baseMint });
      return { success: false, error: `Token account error: ${error.message}` };
    }
    
    // Calculate minimum SOL to receive (with slippage)
    const expectedSolAmount = tokenAmount * priceData.price;
    const slippageFactor = 1 - (config.SLIPPAGE_TOLERANCE_BPS / 10000);
    const minSolAmount = expectedSolAmount * slippageFactor;
    
    txLogger.info(`Sell parameters calculated`, {
      txId,
      tokenAmount,
      expectedSolAmount,
      minSolAmount,
      slippageBps: config.SLIPPAGE_TOLERANCE_BPS
    });
    
    // Build swap instructions
    const swap = buildSellSwapInstructions({
      wallet: wallet.publicKey,
      tokenMint: baseMint,
      lpAddress: position.lpAddress,
      tokenAmount,
      minSolAmount
    });
    
    // Check if we should simulate the transaction
    if (config.SIMULATE_TRANSACTIONS) {
      txLogger.info(`Simulating transaction before sending`, { txId });
      
      try {
        const simulation = await connection.simulateTransaction(swap.instructions);
        
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
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: swap.instructions
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
    
    // Calculate profit/loss
    const soldForSol = expectedSolAmount; // In production, fetch the actual amount
    const boughtForSol = position.amountInSol;
    const profitLossSol = soldForSol - boughtForSol;
    const profitLossPercent = ((soldForSol / boughtForSol) - 1) * 100;
    
    txLogger.info(`Sell completed with P/L: ${profitLossSol.toFixed(4)} SOL (${profitLossPercent.toFixed(2)}%)`, {
      txId,
      signature,
      soldForSol,
      boughtForSol,
      profitLossSol,
      profitLossPercent
    });
    
    // Publish successful sell to Redis
    const sellData = {
      txId,
      signature,
      baseMint,
      tokenAmount,
      soldForSol,
      boughtForSol,
      profitLossSol,
      profitLossPercent,
      timestamp: Date.now(),
      isDryRun: false
    };
    
    await redisClient.publish(
      REDIS_CHANNELS.SUCCESSFUL_SELLS,
      JSON.stringify(sellData)
    );
    
    // Remove from active positions in Redis
    await redisClient.del(`positions:${baseMint}`);
    
    // Increment sell stats counter
    await redisClient.incr('stats:sell_count');
    
    return {
      success: true,
      signature,
      sellData
    };
  } catch (error) {
    txLogger.error(`Sell transaction failed`, {
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
 * Evaluates whether to sell a token based on price and position data
 * @param {string} baseMint - Token mint address
 * @param {Object} priceData - Current price data
 * @param {Object} position - Position data
 * @returns {Promise<{shouldSell: boolean, reason: string}>}
 */
async function evaluateSellConditions(baseMint, priceData, position) {
  try {
    // Skip if no buy price reference
    if (!position.buyPrice) {
      return { shouldSell: false, reason: 'No buy price reference' };
    }
    
    // Calculate price change percentage
    const priceChangePercent = ((priceData.price / position.buyPrice) - 1) * 100;
    
    logger.debug(`Evaluating ${baseMint}: Price change ${priceChangePercent.toFixed(2)}%`, {
      currentPrice: priceData.price,
      buyPrice: position.buyPrice,
      takeProfitPct: config.TAKE_PROFIT_PERCENTAGE,
      stopLossPct: config.STOP_LOSS_PERCENTAGE,
      isDryRun: position.isDryRun || config.DRY_RUN
    });
    
    // Check take profit condition
    if (priceChangePercent >= config.TAKE_PROFIT_PERCENTAGE) {
      return {
        shouldSell: true,
        reason: `Take profit triggered: ${priceChangePercent.toFixed(2)}% gain`
      };
    }
    
    // Check stop loss condition
    if (priceChangePercent <= -config.STOP_LOSS_PERCENTAGE) {
      return {
        shouldSell: true,
        reason: `Stop loss triggered: ${priceChangePercent.toFixed(2)}% loss`
      };
    }
    
    // No sell condition met
    return { shouldSell: false, reason: 'No sell condition met' };
  } catch (error) {
    logger.error(`Error evaluating sell conditions for ${baseMint}: ${error.message}`);
    return { shouldSell: false, reason: `Error: ${error.message}` };
  }
}

/**
 * Checks all active positions and executes sells if conditions are met
 * @returns {Promise<void>}
 */
async function checkPositionsAndSell() {
  if (activePositions.size === 0) {
    logger.debug('No active positions to check');
    return;
  }
  
  logger.info(`Checking ${activePositions.size} active positions`);
  
  // Process each active position
  for (const [baseMint, position] of activePositions.entries()) {
    try {
      logger.debug(`Checking position: ${baseMint}`, {
        isDryRun: position.isDryRun || config.DRY_RUN
      });
      
      // Get current price (pass isDryRun flag)
      const priceData = await calculateTokenPrice(baseMint, position.lpAddress, position.isDryRun);
      
      if (!priceData) {
        logger.warn(`Failed to get price data for ${baseMint}, skipping`);
        continue;
      }
      
      // Evaluate sell conditions
      const { shouldSell, reason } = await evaluateSellConditions(baseMint, priceData, position);
      
      if (shouldSell) {
        logger.info(`Selling ${baseMint}: ${reason}`, {
          isDryRun: position.isDryRun || config.DRY_RUN
        });
        
        // Execute sell transaction
        const result = await executeSellTransaction(baseMint, priceData, position);
        
        if (result.success) {
          logger.info(`Successfully sold ${baseMint}`, {
            signature: result.signature,
            profitLoss: result.sellData.profitLossPercent.toFixed(2) + '%',
            isDryRun: position.isDryRun || config.DRY_RUN
          });
          
          // Remove from active positions map
          activePositions.delete(baseMint);
        } else {
          logger.error(`Failed to sell ${baseMint}`, { 
            error: result.error,
            isDryRun: position.isDryRun || config.DRY_RUN
          });
        }
      } else {
        logger.debug(`Not selling ${baseMint}: ${reason}`);
      }
    } catch (error) {
      logger.error(`Error processing position ${baseMint}: ${error.message}`);
    }
  }
}

/**
 * Processes a new successful buy notification from Redis
 * @param {string} message - JSON string containing buy data
 */
async function processSuccessfulBuy(message) {
  try {
    const buyData = JSON.parse(message);
    
    if (!buyData.baseMint) {
      logger.warn('Received buy notification without baseMint');
      return;
    }
    
    logger.info(`Processing successful buy: ${buyData.baseMint}`, {
      isDryRun: buyData.isDryRun || config.DRY_RUN
    });
    
    // Create position object
    const position = {
      baseMint: buyData.baseMint,
      lpAddress: buyData.lpAddress,
      amountInSol: buyData.amountInSol,
      buyTimestamp: buyData.timestamp,
      signature: buyData.signature,
      tokenAmount: buyData.tokenAmount || 0,
      isDryRun: buyData.isDryRun || config.DRY_RUN
    };
    
    // Use provided estimated price if available (from dry run)
    if (buyData.estimatedPrice) {
      position.buyPrice = buyData.estimatedPrice;
      logger.info(`Using provided price for ${buyData.baseMint}: ${buyData.estimatedPrice}`);
    } else {
      // Try to calculate an initial price for reference
      try {
        const priceData = await calculateTokenPrice(
          buyData.baseMint, 
          buyData.lpAddress, 
          buyData.isDryRun || config.DRY_RUN
        );
        
        if (priceData) {
          position.buyPrice = priceData.price;
          logger.info(`Set initial price for ${buyData.baseMint}: ${priceData.price}`);
        }
      } catch (error) {
        logger.warn(`Failed to get initial price for ${buyData.baseMint}: ${error.message}`);
        position.buyPrice = 0; // Will be updated on next check
      }
    }
    
    // Add to active positions
    activePositions.set(buyData.baseMint, position);
    
    // Also store in Redis (as backup)
    await redisClient.hset(`positions:${buyData.baseMint}`, {
      ...position,
      isDryRun: (position.isDryRun || config.DRY_RUN) ? 'true' : 'false' // Store as string in Redis
    });
    
    logger.info(`Added position for ${buyData.baseMint} to active monitoring`);
  } catch (error) {
    logger.error(`Error processing successful buy: ${error.message}`);
  }
}

/**
 * Main function to start the sell manager service
 */
async function startSellManager() {
  try {
    logger.info('Starting Sell Manager service', {
      mode: config.DRY_RUN ? 'DRY RUN' : 'LIVE'
    });
    
    // Load existing positions from Redis
    await loadPositionsFromRedis();
    
    // Subscribe to successful buys channel
    redisSubscriber.on('ready', () => {
      logger.info('Redis subscriber connected. Subscribing to successful buys channel.');
      redisSubscriber.subscribe(REDIS_CHANNELS.SUCCESSFUL_BUYS);
    });
    
    redisSubscriber.on('message', (channel, message) => {
      if (channel === REDIS_CHANNELS.SUCCESSFUL_BUYS) {
        processSuccessfulBuy(message);
      }
    });
    
    redisSubscriber.on('error', (error) => {
      logger.error(`Redis subscriber error: ${error.message}`);
    });
    
    // Set up position checking interval
    const checkInterval = setInterval(
      checkPositionsAndSell,
      PERFORMANCE_SETTINGS.PRICE_CHECK_INTERVAL_MS
    );
    
    // Set up heartbeat interval
    const heartbeatInterval = setInterval(async () => {
      try {
        const timestamp = Date.now();
        await redisClient.set('heartbeat:sell-manager', timestamp);
        await redisClient.publish(REDIS_CHANNELS.HEARTBEATS, JSON.stringify({
          service: 'sell-manager',
          timestamp,
          activePositions: activePositions.size,
          dryRun: config.DRY_RUN
        }));
        logger.debug('Heartbeat sent');
      } catch (error) {
        logger.error(`Failed to send heartbeat: ${error.message}`);
      }
    }, PERFORMANCE_SETTINGS.HEARTBEAT_INTERVAL_MS);
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      // Clear intervals
      clearInterval(checkInterval);
      clearInterval(heartbeatInterval);
      
      // Close Redis connections
      redisSubscriber.quit();
      redisClient.quit();
      
      setTimeout(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      }, 1000);
    });
    
    logger.info(`Sell Manager service started successfully in ${config.DRY_RUN ? 'DRY RUN' : 'LIVE'} mode`);
  } catch (error) {
    logger.error(`Failed to start Sell Manager: ${error.message}`);
    process.exit(1);
  }
}
