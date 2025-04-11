/**
 * @fileoverview Shared constants for Solana memecoin sniping bot
 * Defines Redis channels, Solana addresses, and default settings
 */

const { PublicKey } = require('@solana/web3.js');

// Redis channel names for inter-service communication
const REDIS_CHANNELS = {
  NEW_POOLS: 'sniper:new_pools',
  POTENTIAL_BUYS: 'sniper:potential_buys',
  SUCCESSFUL_BUYS: 'sniper:successful_buys',
  SUCCESSFUL_SELLS: 'sniper:successful_sells',
  LOGS: 'sniper:logs',
  COMMANDS: 'sniper:commands',
  HEARTBEATS: 'sniper:heartbeats'
};

// Common Solana addresses
const SOLANA_ADDRESSES = {
  SOL_MINT: new PublicKey('So11111111111111111111111111111111111111112'),
  SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  ASSOCIATED_TOKEN_PROGRAM: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  RAYDIUM_LIQUIDITY_PROGRAM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
};

// Known safe tokens (mapped to their symbols)
const KNOWN_TOKENS = {
  // Major tokens
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': 'stSOL',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL'
};

// Bot performance settings
const PERFORMANCE_SETTINGS = {
  MAX_TRANSACTION_RETRIES: 3,
  PRICE_CHECK_INTERVAL_MS: 5000, // 5 seconds
  HEARTBEAT_INTERVAL_MS: 10000,  // 10 seconds
  CONNECTION_CHECK_INTERVAL_MS: 30000 // 30 seconds
};

// Regex patterns for validation
const REGEX_PATTERNS = {
  SOLANA_ADDRESS: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
};

module.exports = {
  REDIS_CHANNELS,
  SOLANA_ADDRESSES,
  KNOWN_TOKENS,
  PERFORMANCE_SETTINGS,
  REGEX_PATTERNS
};
