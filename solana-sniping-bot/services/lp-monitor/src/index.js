/**
 * @fileoverview Liquidity Pool Monitor Service for Solana Memecoin Sniping Bot
 * Establishes a WebSocket connection to Solana, subscribes to DEX program logs,
 * detects new liquidity pool creations, and publishes them to Redis.
 */

const Redis = require('ioredis');
const { Connection, PublicKey } = require('@solana/web3.js');

// Debug path resolution
console.log('Current directory:', process.cwd());
console.log('NODE_PATH:', process.env.NODE_PATH);
console.log('Module search paths:', module.paths);

try {
  // Import shared modules with more explicit error handling
  const sharedLogger = require('shared/logger');
  console.log('Successfully imported logger');
  const createLogger = sharedLogger.createLogger;
  
  const config = require('shared/config').default;
  console.log('Successfully imported config');
  
  const { REDIS_CHANNELS, SOLANA_ADDRESSES } = require('shared/constants');
  console.log('Successfully imported constants');
  
  const { getConnection } = require('shared/connection');
  console.log('Successfully imported connection');

  // Initialize logger
  const logger = createLogger('lp-monitor');

  // Initialize Redis client for publishing
  const redisPublisher = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || '',
    retryStrategy: times => {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms`);
      return delay;
    }
  });

  // Tracking variables
  let wsSubscriptionId = null;
  let wsConnection = null;
  let connectionHealthCheckInterval = null;
  let reconnectAttempt = 0;

  /**
   * Parses Raydium LP V4 initialization logs to extract key pool information
   * @param {Object} log - Solana transaction log
   * @returns {Object|null} - Parsed pool data or null if not a valid pool initialization
   */
  function parseRaydiumLpLogs(log) {
    try {
      // Check if this is a Raydium LP V4 program log
      if (!log.logs || log.logs.length === 0) {
        return null;
      }

      // Look for Initialize2 instruction in logs which indicates pool creation
      const initializeLogIndex = log.logs.findIndex(logLine => 
        logLine.includes('Program log: Instruction: Initialize2'));
      
      if (initializeLogIndex === -1) {
        return null;
      }

      logger.debug('Found potential LP initialization log');
      
      // Extract pool information from logs
      // Note: This is a simplified parser - production would use proper log parsing
      // and account data fetching for more reliable extraction
      
      // Example log parsing logic - adjust based on actual log format
      let baseMint = null;
      let quoteMint = null;
      let lpAddress = null;
      
      // Search for mint addresses in logs
      for (let i = initializeLogIndex; i < log.logs.length; i++) {
        const logLine = log.logs[i];
        
        // Extract mints and pool address from log lines
        // This is a simplified example - real implementation would need to match
        // the exact format of Raydium LP V4 initialization logs
        if (logLine.includes('base mint:')) {
          baseMint = logLine.split('base mint:')[1].trim();
        } else if (logLine.includes('quote mint:')) {
          quoteMint = logLine.split('quote mint:')[1].trim();
        } else if (logLine.includes('pool address:')) {
          lpAddress = logLine.split('pool address:')[1].trim();
        }
      }
      
      // If we couldn't extract the necessary information, fallback to account keys
      if (!baseMint || !quoteMint || !lpAddress) {
        logger.debug('Could not extract pool info from logs, checking accounts');
        
        // In a real implementation, we would fetch the LP account data
        // and parse it to extract the mints and other information
        
        // For this example, we'll just check if we at least have the LP address
        // from the transaction log and mark this as a simplified detection
        if (log.signature && log.err === null) {
          // This is a successful transaction
          lpAddress = lpAddress || log.logMessages?.[0]?.split(' ')[0];
          
          if (lpAddress) {
            logger.info(`Detected potential LP creation with limited info: ${lpAddress}`);
            return {
              baseMint: baseMint || 'unknown',
              quoteMint: quoteMint || 'unknown',
              lpAddress,
              detectionMethod: 'partial'
            };
          }
        }
        
        return null;
      }
      
      // Validate addresses
      try {
        new PublicKey(baseMint);
        new PublicKey(quoteMint);
        new PublicKey(lpAddress);
      } catch (e) {
        logger.warn(`Invalid address format in detected pool: ${e.message}`);
        return null;
      }
      
      return {
        baseMint,
        quoteMint,
        lpAddress,
        timestamp: Date.now(),
        detectionMethod: 'log_parse'
      };
    } catch (error) {
      logger.error(`Error parsing LP logs: ${error.message}`);
      return null;
    }
  }

  /**
   * Handles a log notification from the WebSocket subscription
   * @param {Object} notification - Log notification from Solana
   */
  async function handleLogNotification(notification) {
    try {
      // Skip notifications without proper value/logs
      if (!notification.value || !notification.value.logs) {
        return;
      }
      
      const log = notification.value;
      const programId = log.logMessages?.[0]?.split(' ')[0];
      
      // Check if this is a log from the target DEX program
      if (programId === config.RAYDIUM_LP_V4_PROGRAM_ID) {
        logger.debug(`Processing log from Raydium LP V4 program`);
        
        const poolData = parseRaydiumLpLogs(log);
        
        if (poolData) {
          logger.info(`Detected new liquidity pool: ${poolData.lpAddress} (Base: ${poolData.baseMint}, Quote: ${poolData.quoteMint})`);
          
          // Publish to Redis
          await redisPublisher.publish(
            REDIS_CHANNELS.NEW_POOLS,
            JSON.stringify(poolData)
          );
          
          logger.info(`Published pool ${poolData.lpAddress} to NEW_POOLS channel`);
        }
      }
    } catch (error) {
      logger.error(`Error handling log notification: ${error.message}`);
    }
  }

  /**
   * Sets up WebSocket log subscription for DEX programs
   * @returns {Promise<boolean>} - True if subscription successful
   */
  async function setupLogSubscription() {
    try {
      // Clean up any existing subscription
      if (wsSubscriptionId && wsConnection) {
        try {
          await wsConnection.removeLogListener(wsSubscriptionId);
          logger.debug(`Removed existing log subscription: ${wsSubscriptionId}`);
        } catch (e) {
          logger.warn(`Error removing previous subscription: ${e.message}`);
        }
      }
      
      // Get a fresh connection with WebSocket enabled
      const connection = await getConnection();
      
      // Create a dedicated WebSocket connection for log subscription
      // This ensures we're using a connection with WebSocket transport
      wsConnection = new Connection(
        connection._rpcEndpoint, 
        { 
          wsEndpoint: connection._rpcWsEndpoint,
          commitment: config.SOLANA_COMMITMENT 
        }
      );
      
      logger.info(`Setting up WebSocket connection to ${wsConnection._rpcEndpoint}`);
      
      // Create log subscription for Raydium LP V4 program
      const raydiumLpProgramId = new PublicKey(config.RAYDIUM_LP_V4_PROGRAM_ID);
      
      // Subscribe to logs
      wsSubscriptionId = wsConnection.onLogs(
        raydiumLpProgramId,
        handleLogNotification,
        config.SOLANA_COMMITMENT
      );
      
      logger.info(`Subscribed to Raydium LP V4 program logs: ${config.RAYDIUM_LP_V4_PROGRAM_ID}`);
      logger.debug(`Subscription ID: ${wsSubscriptionId}`);
      
      // Reset reconnect attempts on successful connection
      reconnectAttempt = 0;
      
      return true;
    } catch (error) {
      logger.error(`Failed to set up log subscription: ${error.message}`);
      return false;
    }
  }

  /**
   * Checks WebSocket connection health and reconnects if needed
   */
  async function checkConnectionHealth() {
    try {
      if (!wsConnection || !wsSubscriptionId) {
        logger.warn('WebSocket connection not established, attempting to connect');
        await setupLogSubscription();
        return;
      }
      
      // For WebSocket connections, we'll consider it healthy if we have an active
      // subscription ID, but we could add additional checks here
      
      logger.debug('WebSocket connection health check passed');
    } catch (error) {
      logger.error(`WebSocket connection health check failed: ${error.message}`);
      
      // Attempt to reconnect
      reconnectAttempt++;
      const delay = Math.min(reconnectAttempt * 1000, 30000); // Exponential backoff up to 30 seconds
      
      logger.info(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempt})`);
      
      setTimeout(async () => {
        await setupLogSubscription();
      }, delay);
    }
  }

  /**
   * Main startup function
   */
  async function startup() {
    try {
      logger.info('LP Monitor service starting up');
      
      // Set up WebSocket subscription
      const subscriptionSuccess = await setupLogSubscription();
      
      if (!subscriptionSuccess) {
        logger.error('Failed to set up initial log subscription, will retry');
        setTimeout(startup, 5000);
        return;
      }
      
      // Set up connection health check interval
      connectionHealthCheckInterval = setInterval(
        checkConnectionHealth,
        30000 // 30 seconds
      );
      
      // Set up heartbeat interval
      const heartbeatInterval = setInterval(async () => {
        try {
          const timestamp = Date.now();
          await redisPublisher.set('heartbeat:lp-monitor', timestamp);
          await redisPublisher.publish(REDIS_CHANNELS.HEARTBEATS, JSON.stringify({
            service: 'lp-monitor',
            timestamp
          }));
          logger.debug('Heartbeat sent');
        } catch (error) {
          logger.error(`Failed to send heartbeat: ${error.message}`);
        }
      }, 10000); // Every 10 seconds
      
      // Handle graceful shutdown
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, shutting down gracefully');
        
        // Clear intervals
        clearInterval(connectionHealthCheckInterval);
        clearInterval(heartbeatInterval);
        
        // Remove WebSocket subscription
        if (wsSubscriptionId && wsConnection) {
          try {
            await wsConnection.removeLogListener(wsSubscriptionId);
            logger.info(`Removed log subscription: ${wsSubscriptionId}`);
          } catch (e) {
            logger.warn(`Error removing subscription: ${e.message}`);
          }
        }
        
        // Close Redis connection
        redisPublisher.quit();
        
        logger.info('Shutdown complete');
        process.exit(0);
      });
    } catch (error) {
      logger.error(`Startup error: ${error.message}`);
      setTimeout(startup, 5000); // Retry startup after 5 seconds
    }
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error.message}\n${error.stack}`);
    
    // Exit with error code for container orchestration to restart
    process.exit(1);
  });

  // Start the service
  startup().then(() => {
    logger.info('LP Monitor service started successfully');
  });

} catch (error) {
  console.error('CRITICAL ERROR LOADING MODULES:', error.message);
  console.error('Stack trace:', error.stack);
  // List files in important directories to debug
  const fs = require('fs');
  try {
    console.log('Contents of /usr/src/app:');
    console.log(fs.readdirSync('/usr/src/app'));
    
    console.log('Contents of /usr/src/app/shared:');
    console.log(fs.readdirSync('/usr/src/app/shared'));
    
    console.log('Contents of /usr/src/app/service:');
    console.log(fs.readdirSync('/usr/src/app/service'));
  } catch (e) {
    console.error('Error listing directories:', e.message);
  }
  
  process.exit(1);
}
