/**
 * @fileoverview Wallet loader for Solana memecoin sniping bot
 * Loads a Solana Keypair from a base58 secret key in environment variables
 * 
 * SECURITY WARNING: Using environment variables for private keys is NOT 
 * recommended for production use. Consider using hardware wallets,
 * encrypted keystores, or secure key management solutions.
 */

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const config = require('./config');
const { createLogger } = require('./logger');

// Initialize logger
const logger = createLogger('wallet');

// Cache for the loaded keypair
let walletKeypair = null;

/**
 * Validates if a string looks like a valid base58 private key
 * @param {string} privateKeyString - The private key string to validate
 * @returns {boolean} - True if valid format, false otherwise
 */
function isValidPrivateKeyFormat(privateKeyString) {
  // Basic validation: base58 keys are typically 88 characters
  if (!privateKeyString || privateKeyString.length < 80) {
    return false;
  }
  
  try {
    // Try to decode it - will throw if invalid base58
    const decoded = bs58.decode(privateKeyString);
    // Private keys should decode to 64 bytes (512 bits)
    return decoded.length === 64;
  } catch (e) {
    return false;
  }
}

/**
 * Loads a Solana keypair from the configured secret key
 * @returns {Keypair} - A Solana keypair
 * @throws {Error} - If the key is invalid or missing
 */
function loadWallet() {
  // Return cached keypair if available
  if (walletKeypair) {
    return walletKeypair;
  }
  
  const privateKeyString = config.WALLET_SECRET_KEY;
  
  // Validate key format
  if (!isValidPrivateKeyFormat(privateKeyString)) {
    throw new Error('Invalid wallet private key format. Must be a valid base58 encoded string.');
  }
  
  try {
    // Decode the base58 private key
    const privateKey = bs58.decode(privateKeyString);
    
    // Create a keypair from the private key
    walletKeypair = Keypair.fromSecretKey(privateKey);
    
    // Log the public key (safe to display)
    const publicKey = walletKeypair.publicKey.toString();
    logger.info(`Wallet loaded successfully with public key: ${publicKey}`);
    
    // Masked public key for additional security in logs
    const maskedPubkey = `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
    logger.debug(`Using wallet: ${maskedPubkey}`);
    
    return walletKeypair;
  } catch (error) {
    logger.error(`Failed to load wallet: ${error.message}`);
    throw new Error(`Failed to load wallet: ${error.message}`);
  }
}

/**
 * Gets the public key of the loaded wallet as string
 * @returns {string} - The wallet's public key
 */
function getWalletPublicKey() {
  const keypair = loadWallet();
  return keypair.publicKey.toString();
}

module.exports = {
  loadWallet,
  getWalletPublicKey
};