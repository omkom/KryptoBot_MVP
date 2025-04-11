/**
 * @fileoverview Solana connection manager
 * Provides connection creation with RPC fallbacks and health checks
 */

const { Connection, clusterApiUrl } = require('@solana/web3.js');
const config = require('./config').default;
const { createLogger } = require('./logger');

// Initialize context-specific logger
const logger = createLogger('connection');

// Cache the current active connection
let activeConnection = null;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Tests if a connection to an RPC endpoint is healthy
 * @param {Connection} connection - The Solana connection to test
 * @returns {Promise<boolean>} - True if healthy, false otherwise
 */
async function isConnectionHealthy(connection) {
  try {
    // Simple health check: get a recent blockhash
    const { blockhash } = await connection.getLatestBlockhash({
      commitment: config.SOLANA_COMMITMENT
    });
    return !!blockhash;
  } catch (error) {
    logger.warn(`Connection health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Creates a new Solana connection
 * @param {string} endpoint - RPC endpoint URL
 * @param {string} commitment - Commitment level
 * @returns {Connection} - A configured Solana connection
 */
function createConnection(endpoint, commitment = config.SOLANA_COMMITMENT) {
  logger.debug(`Creating connection to ${endpoint} with ${commitment} commitment`);
  
  return new Connection(endpoint, {
    commitment,
    confirmTransactionInitialTimeout: 60000, // 60 seconds
    disableRetryOnRateLimit: false,
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        timeout: 30000, // 30 seconds fetch timeout
      });
    }
  });
}

/**
 * Gets an array of all available RPC endpoints
 * @returns {string[]} - Array of endpoint URLs
 */
function getAllEndpoints() {
  const endpoints = [
    config.RPC_ENDPOINT,
    ...config.RPC_FALLBACK_ENDPOINTS
  ];
  
  // Filter out duplicates
  return [...new Set(endpoints)];
}

/**
 * Finds a healthy connection from available endpoints
 * @returns {Promise<Connection>} - A healthy Solana connection
 * @throws {Error} - If no healthy connection can be established
 */
async function findHealthyConnection() {
  const endpoints = getAllEndpoints();
  logger.debug(`Finding healthy connection from ${endpoints.length} endpoints`);
  
  // Try each endpoint until we find a healthy one
  for (const endpoint of endpoints) {
    try {
      const connection = createConnection(endpoint);
      const healthy = await isConnectionHealthy(connection);
      
      if (healthy) {
        logger.info(`Established healthy connection to ${endpoint}`);
        return connection;
      }
      
      logger.warn(`Endpoint ${endpoint} is not healthy, trying next`);
    } catch (error) {
      logger.warn(`Failed to connect to ${endpoint}: ${error.message}`);
    }
  }
  
  // If we reach here, all endpoints failed
  throw new Error('Failed to establish connection to any Solana RPC endpoint');
}

/**
 * Gets a healthy Solana connection, creating a new one if necessary
 * @returns {Promise<Connection>} - A healthy Solana connection
 */
async function getConnection() {
  const now = Date.now();
  
  // If we have a cached connection and it's still fresh, use it
  if (activeConnection && (now - lastHealthCheck < HEALTH_CHECK_INTERVAL)) {
    return activeConnection;
  }
  
  // If we have a cached connection but need to check health
  if (activeConnection) {
    try {
      const healthy = await isConnectionHealthy(activeConnection);
      if (healthy) {
        lastHealthCheck = now;
        return activeConnection;
      }
      
      logger.warn('Cached connection is no longer healthy, finding new connection');
    } catch (error) {
      logger.warn(`Error checking cached connection health: ${error.message}`);
    }
  }
  
  // Find a new healthy connection
  activeConnection = await findHealthyConnection();
  lastHealthCheck = now;
  return activeConnection;
}

/**
 * Forces connection refresh regardless of health check interval
 * @returns {Promise<Connection>} - A fresh, healthy Solana connection
 */
async function refreshConnection() {
  logger.debug('Forcing connection refresh');
  activeConnection = null;
  return getConnection();
}

module.exports = {
  getConnection,
  refreshConnection,
  isConnectionHealthy
};
