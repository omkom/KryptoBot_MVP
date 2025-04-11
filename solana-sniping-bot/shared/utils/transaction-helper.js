/**
 * @fileoverview Transaction helper utilities for Solana memecoin sniping bot
 * Provides functions for creating, signing, and submitting transactions
 * with high-priority fees and advanced retry strategies
 */

const {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { v4: uuidv4 } = require('uuid');
const { createLogger, createTransactionLogger } = require('../logger');
const config = require('../config').default;

// Initialize context-specific logger
const logger = createLogger('transaction-helper');
const txLogger = createTransactionLogger('transaction-helper');

/**
 * Creates a unique transaction ID for tracking purposes
 * @returns {string} Transaction ID
 */
function createTransactionId() {
  return `tx_${Date.now()}_${uuidv4().slice(0, 8)}`;
}

/**
 * Adds compute budget instructions to a transaction for priority fees
 * @param {Array} instructions - Array of transaction instructions
 * @param {Object} options - Options for compute budget
 * @param {number} options.units - Compute unit limit (default from config)
 * @param {number} options.microLamports - Priority fee in micro lamports (default from config)
 * @returns {Array} - Instructions with compute budget prepended
 */
function addPriorityFees(instructions, options = {}) {
  const units = options.units || config.COMPUTE_UNITS_LIMIT;
  const microLamports = options.microLamports || config.PRIORITY_FEE_MICRO_LAMPORTS;
  
  // Create compute budget instructions
  const computeBudgetInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
  ];
  
  // Return combined instructions with compute budget first
  return [...computeBudgetInstructions, ...instructions];
}

/**
 * Simulates a transaction to check for errors before submitting
 * @param {Connection} connection - Solana RPC connection
 * @param {Array} instructions - Transaction instructions
 * @param {PublicKey} payer - Payer's public key
 * @param {string} txId - Transaction ID for logging
 * @returns {Promise<{success: boolean, error?: string, logs?: string[]}>} - Simulation results
 */
async function simulateTransaction(connection, instructions, payer, txId) {
  try {
    txLogger.debug(`Simulating transaction`, { txId });
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Create message
    const messageV0 = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    // Create transaction
    const transaction = new VersionedTransaction(messageV0);
    
    // Simulate transaction
    const simulation = await connection.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      txLogger.error(`Transaction simulation failed`, {
        txId,
        error: JSON.stringify(simulation.value.err)
      });
      
      return {
        success: false,
        error: JSON.stringify(simulation.value.err),
        logs: simulation.value.logs || []
      };
    }
    
    txLogger.debug(`Transaction simulation successful`, { txId });
    return {
      success: true,
      logs: simulation.value.logs || []
    };
  } catch (error) {
    txLogger.error(`Error during transaction simulation`, {
      txId,
      error: error.message
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates, signs, and sends a transaction with retry logic
 * @param {Object} params - Transaction parameters
 * @param {Connection} params.connection - Solana RPC connection
 * @param {Array} params.instructions - Transaction instructions
 * @param {Keypair} params.wallet - Signer wallet
 * @param {Object} params.options - Transaction options
 * @param {boolean} params.options.skipPreflight - Skip preflight checks (default: true for speed)
 * @param {number} params.options.maxRetries - Max retry attempts (default: 3)
 * @param {boolean} params.options.simulate - Simulate transaction before sending
 * @returns {Promise<{success: boolean, signature?: string, error?: string}>} - Transaction results
 */
async function sendTransaction(params) {
  const { 
    connection, 
    instructions, 
    wallet, 
    options = {} 
  } = params;
  
  const txId = createTransactionId();
  const skipPreflight = options.skipPreflight !== undefined ? options.skipPreflight : true;
  const maxRetries = options.maxRetries || 3;
  const simulate = options.simulate || config.SIMULATE_TRANSACTIONS;
  
  txLogger.info(`Preparing transaction`, { txId, skipPreflight, maxRetries });
  
  try {
    // Add priority fees if not already included
    const instructionsWithFees = options.noPriorityFees ? 
      instructions : 
      addPriorityFees(instructions, options);
    
    // Simulate transaction if requested
    if (simulate) {
      const simulation = await simulateTransaction(
        connection,
        instructionsWithFees,
        wallet.publicKey,
        txId
      );
      
      if (!simulation.success) {
        return {
          success: false,
          error: `Simulation failed: ${simulation.error}`
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
      instructions: instructionsWithFees
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    
    // Sign transaction
    transaction.sign([wallet]);
    txLogger.info(`Transaction signed`, { txId, blockhash });
    
    // Send transaction with retry logic
    let signature = null;
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          txLogger.info(`Retry attempt ${retryCount}/${maxRetries}`, { txId });
        }
        
        // Send transaction
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight,
          maxRetries: 1, // We handle retries manually
          preflightCommitment: config.SOLANA_COMMITMENT
        });
        
        txLogger.info(`Transaction sent`, { txId, signature, retry: retryCount });
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable error
        const isRetryable = 
          error.message.includes('timeout') ||
          error.message.includes('block height exceeded') ||
          error.message.includes('rate limited');
        
        if (!isRetryable || retryCount >= maxRetries) {
          txLogger.error(`Transaction send failed with non-retryable error`, {
            txId,
            error: error.message,
            retry: retryCount
          });
          break;
        }
        
        retryCount++;
        const delay = Math.min(500 * retryCount, 2000); // Exponential backoff
        
        txLogger.warn(`Transaction send failed, will retry in ${delay}ms`, {
          txId,
          error: error.message,
          retry: retryCount,
          delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we couldn't send the transaction after all retries
    if (!signature) {
      return {
        success: false,
        error: lastError ? lastError.message : 'Unknown error sending transaction'
      };
    }
    
    // Wait for confirmation
    const confirmationStrategy = {
      signature,
      lastValidBlockHeight,
      blockhash
    };
    
    txLogger.info(`Awaiting confirmation`, { txId, signature });
    
    const confirmation = await connection.confirmTransaction(
      confirmationStrategy,
      config.SOLANA_COMMITMENT
    );
    
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
    
    return {
      success: true,
      signature,
      txId
    };
  } catch (error) {
    txLogger.error(`Transaction failed`, {
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
 * Generates a simulated transaction signature for DryRun mode
 * @returns {string} Simulated transaction signature
 */
function generateSimulatedSignature() {
  const randomBytes = uuidv4().replace(/-/g, '');
  return randomBytes + 'DryRunSim';
}

/**
 * Simulates a transaction for DryRun mode
 * @param {string} txId - Transaction ID
 * @param {Object} options - Simulation options
 * @param {number} options.successRate - Percentage chance of success (default from config)
 * @param {number} options.confirmationTime - Simulated confirmation time in ms (default from config)
 * @returns {Promise<{success: boolean, signature: string, error?: string}>}
 */
async function simulateDryRunTransaction(txId, options = {}) {
  const successRate = options.successRate || config.DRY_RUN_SUCCESS_RATE;
  const confirmationTime = options.confirmationTime || config.DRY_RUN_CONFIRMATION_MS;
  
  txLogger.info(`DryRun: Simulating transaction`, { txId });
  
  // Generate a transaction signature for tracking
  const signature = generateSimulatedSignature();
  
  // Simulate transaction processing time
  const processingTime = confirmationTime + (Math.random() * 2000);
  txLogger.debug(`DryRun: Simulating processing time of ${processingTime.toFixed(0)}ms`, { txId, signature });
  
  await new Promise(resolve => setTimeout(resolve, processingTime));
  
  // Simulate success/failure based on success rate
  const success = Math.random() * 100 < successRate;
  
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
  
  txLogger.info(`DryRun: Transaction simulation succeeded`, { 
    txId, 
    signature
  });
  
  return {
    success: true,
    signature,
    txId
  };
}

module.exports = {
  createTransactionId,
  addPriorityFees,
  simulateTransaction,
  sendTransaction,
  generateSimulatedSignature,
  simulateDryRunTransaction
};