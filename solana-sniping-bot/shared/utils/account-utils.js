/**
 * @fileoverview Account utilities for Solana memecoin sniping bot
 * Provides functions for managing SPL token accounts and associated token accounts
 */

const { 
  PublicKey, 
  Connection,
  SystemProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const { createLogger } = require('../logger');

// Initialize context-specific logger
const logger = createLogger('account-utils');

/**
 * Checks if the Associated Token Account exists for a given mint
 * If not, creates an instruction to create it
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} ownerPubkey - Owner's public key
 * @param {PublicKey} mintPubkey - Token mint public key
 * @param {boolean} allowOffCurve - Allow off-curve public keys
 * @returns {Promise<{exists: boolean, address: PublicKey, createInstruction: TransactionInstruction|null}>}
 */
async function checkAndCreateATA(connection, ownerPubkey, mintPubkey, allowOffCurve = false) {
  try {
    // Get the ATA address
    const ataAddress = await getAssociatedTokenAddress(
      mintPubkey,
      ownerPubkey,
      allowOffCurve
    );
    
    logger.debug(`Checking ATA for mint ${mintPubkey.toString()} owned by ${ownerPubkey.toString()}`);
    
    try {
      // Check if the ATA already exists
      await getAccount(connection, ataAddress);
      
      logger.debug(`ATA exists: ${ataAddress.toString()}`);
      
      return {
        exists: true,
        address: ataAddress,
        createInstruction: null
      };
    } catch (error) {
      // If error is account not found, create instruction to create ATA
      if (error.name === 'TokenAccountNotFoundError') {
        logger.debug(`ATA doesn't exist, will create: ${ataAddress.toString()}`);
        
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
  } catch (error) {
    logger.error(`Error checking/creating ATA: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches token balance from an associated token account
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} ownerPubkey - Owner's public key
 * @param {PublicKey} mintPubkey - Token mint public key
 * @returns {Promise<bigint>} - Token account balance (0n if account doesn't exist)
 */
async function getTokenBalance(connection, ownerPubkey, mintPubkey) {
  try {
    // Get the ATA address
    const ataAddress = await getAssociatedTokenAddress(
      mintPubkey,
      ownerPubkey
    );
    
    // Fetch the token account
    try {
      const account = await getAccount(connection, ataAddress);
      return account.amount;
    } catch (error) {
      if (error.name === 'TokenAccountNotFoundError') {
        logger.debug(`No token account found for ${mintPubkey.toString()}, returning 0`);
        return 0n;
      }
      throw error;
    }
  } catch (error) {
    logger.error(`Error fetching token balance: ${error.message}`);
    throw error;
  }
}

/**
 * Checks if a wallet has sufficient SOL for a transaction
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} walletPubkey - Wallet public key
 * @param {number} requiredBalance - Required balance in SOL
 * @returns {Promise<boolean>} - True if sufficient balance
 */
async function hasSufficientSolBalance(connection, walletPubkey, requiredBalance) {
  try {
    const balance = await connection.getBalance(walletPubkey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    return solBalance >= requiredBalance;
  } catch (error) {
    logger.error(`Error checking SOL balance: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches all token accounts owned by a wallet
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} ownerPubkey - Owner's public key
 * @returns {Promise<Array<{mint: string, balance: bigint, address: string}>>} - Token accounts
 */
async function getWalletTokenAccounts(connection, ownerPubkey) {
  try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      ownerPubkey,
      {
        programId: TOKEN_PROGRAM_ID
      }
    );
    
    const parsedAccounts = [];
    
    for (const { account, pubkey } of tokenAccounts.value) {
      // Parse account data to extract mint and balance
      // Format: https://github.com/solana-labs/solana-program-library/blob/master/token/js/src/state/account.ts
      const accountData = account.data;
      const mint = new PublicKey(accountData.slice(0, 32)).toString();
      
      // Read amount as u64 (8 bytes) at offset 64
      const balance = accountData.readBigUInt64LE(64);
      
      parsedAccounts.push({
        mint,
        balance,
        address: pubkey.toString()
      });
    }
    
    return parsedAccounts;
  } catch (error) {
    logger.error(`Error fetching wallet token accounts: ${error.message}`);
    throw error;
  }
}

/**
 * Estimates the minimum SOL needed for a transaction
 * @param {Connection} connection - Solana connection
 * @param {number} numInstructions - Number of instructions
 * @param {number} numSigners - Number of signers
 * @param {number} dataSize - Estimated data size in bytes
 * @returns {Promise<number>} - Estimated fee in SOL
 */
async function estimateTransactionFee(connection, numInstructions, numSigners, dataSize) {
  try {
    // Get current fee structure
    const recentBlockhash = await connection.getRecentBlockhash();
    const feeCalculator = recentBlockhash.feeCalculator;
    
    // Basic size = header + signatures
    let size = 64 + (numSigners * 64);
    
    // Add instruction space
    size += numInstructions * 64; // Simplified estimate
    
    // Add data size
    size += dataSize;
    
    // Calculate fee based on signature and byte costs
    const fee = feeCalculator.lamportsPerSignature * numSigners;
    
    // Add priority fee estimate if relevant
    const priorityFee = config.PRIORITY_FEE_MICRO_LAMPORTS * 
      config.COMPUTE_UNITS_LIMIT / 1000000;
    
    const totalFeeEstimate = (fee + priorityFee) / LAMPORTS_PER_SOL;
    
    // Add buffer for safety
    return totalFeeEstimate * 1.5;
  } catch (error) {
    logger.error(`Error estimating transaction fee: ${error.message}`);
    // Return a reasonable default if estimation fails
    return 0.01;
  }
}

module.exports = {
  checkAndCreateATA,
  getTokenBalance,
  hasSufficientSolBalance,
  getWalletTokenAccounts,
  estimateTransactionFee
};
