/**
 * @fileoverview Configuration loader for Solana memecoin sniping bot
 * Loads and validates environment variables with fallbacks
 * Includes DryRun mode configuration
 */

require('dotenv').config();

// Utility for validation
const validateConfig = (config) => {
  const requiredVars = [
    'RPC_ENDPOINT',
    'WALLET_SECRET_KEY',
    'REDIS_HOST',
    'REDIS_PORT'
  ];

  const missingVars = requiredVars.filter(varName => !config[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return config;
};

// Main configuration object with defaults for optional values
const config = validateConfig({
  // Solana connection
  RPC_ENDPOINT: process.env.RPC_ENDPOINT,
  RPC_FALLBACK_ENDPOINTS: process.env.RPC_FALLBACK_ENDPOINTS 
    ? process.env.RPC_FALLBACK_ENDPOINTS.split(',')
    : ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'],
  SOLANA_COMMITMENT: process.env.SOLANA_COMMITMENT || 'confirmed',
  
  // Wallet
  WALLET_SECRET_KEY: process.env.WALLET_SECRET_KEY,
  
  // Redis connection
  REDIS_HOST: process.env.REDIS_HOST || 'redis',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  
  // DEX parameters
  RAYDIUM_LP_V4_PROGRAM_ID: process.env.RAYDIUM_LP_V4_PROGRAM_ID || '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  
  // Trading parameters
  SLIPPAGE_TOLERANCE_BPS: parseInt(process.env.SLIPPAGE_TOLERANCE_BPS || '100', 10),
  COMPUTE_UNITS_LIMIT: parseInt(process.env.COMPUTE_UNITS_LIMIT || '600000', 10),
  PRIORITY_FEE_MICRO_LAMPORTS: parseInt(process.env.PRIORITY_FEE_MICRO_LAMPORTS || '75000', 10),
  BUY_AMOUNT_SOL: parseFloat(process.env.BUY_AMOUNT_SOL || '0.01'),
  MIN_POOL_SIZE_SOL: parseFloat(process.env.MIN_POOL_SIZE_SOL || '1.0'),
  TAKE_PROFIT_PERCENTAGE: parseInt(process.env.TAKE_PROFIT_PERCENTAGE || '150', 10),
  STOP_LOSS_PERCENTAGE: parseInt(process.env.STOP_LOSS_PERCENTAGE || '50', 10),
  
  // DryRun mode settings
  DRY_RUN: process.env.DRY_RUN === 'true',
  DRY_RUN_SUCCESS_RATE: parseInt(process.env.DRY_RUN_SUCCESS_RATE || '90', 10), // % of simulated txs that succeed
  DRY_RUN_CONFIRMATION_MS: parseInt(process.env.DRY_RUN_CONFIRMATION_MS || '2000', 10), // Simulated confirmation time
  DRY_RUN_PRICE_VOLATILITY: parseInt(process.env.DRY_RUN_PRICE_VOLATILITY || '20', 10), // % price volatility in simulation
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DEBUG: process.env.DEBUG === 'true',
  LOG_FILE_MAX_SIZE: parseInt(process.env.LOG_FILE_MAX_SIZE || '10485760', 10), // 10MB
  LOG_MAX_FILES: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  
  // Transaction simulation
  SIMULATE_TRANSACTIONS: process.env.SIMULATE_TRANSACTIONS === 'true',
});

// Use CommonJS exports instead of ES modules
module.exports = config;