/**
 * @fileoverview WebSocket connection manager for Solana memecoin sniping bot
 * Provides a robust WebSocket connection with automatic reconnection,
 * subscription management, and health checks
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { createLogger } = require('../logger');
const config = require('../config').default;

// Initialize context-specific logger
const logger = createLogger('ws-manager');

/**
 * WebSocket connection manager class
 * Manages connections, subscriptions, and provides automatic reconnection
 */
class WebSocketManager {
  /**
   * Creates a new WebSocketManager
   * @param {Object} options - Configuration options
   * @param {string} options.endpoint - RPC endpoint
   * @param {Array<string>} options.fallbackEndpoints - Fallback RPC endpoints
   * @param {string} options.commitment - Commitment level
   * @param {number} options.healthCheckInterval - Health check interval in ms
   * @param {number} options.maxReconnectAttempts - Maximum reconnection attempts
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || config.RPC_ENDPOINT;
    this.fallbackEndpoints = options.fallbackEndpoints || config.RPC_FALLBACK_ENDPOINTS || [];
    this.commitment = options.commitment || config.SOLANA_COMMITMENT;
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    
    this.connection = null;
    this.subscriptions = new Map(); // Maps subscription ID to subscription info
    this.isConnected = false;
    this.reconnectAttempt = 0;
    this.healthCheckIntervalId = null;
    this.currentEndpointIndex = 0;
    
    // Bind methods to preserve 'this' context
    this.connect = this.connect.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
    this.reconnect = this.reconnect.bind(this);
    this.subscribeToLogs = this.subscribeToLogs.bind(this);
    this.unsubscribe = this.unsubscribe.bind(this);
    this.close = this.close.bind(this);
  }
  
  /**
   * Gets the current or next RPC endpoint
   * @param {boolean} useNext - Whether to cycle to the next endpoint
   * @returns {string} - RPC endpoint URL
   */
  getEndpoint(useNext = false) {
    const allEndpoints = [this.endpoint, ...this.fallbackEndpoints];
    
    if (useNext) {
      this.currentEndpointIndex = (this.currentEndpointIndex + 1) % allEndpoints.length;
    }
    
    return allEndpoints[this.currentEndpointIndex];
  }
  
  /**
   * Establishes a WebSocket connection
   * @returns {Promise<boolean>} - True if connected successfully
   */
  async connect() {
    try {
      const endpoint = this.getEndpoint();
      logger.info(`Connecting to WebSocket at ${endpoint}`);
      
      // Create a new connection with WebSocket support
      this.connection = new Connection(endpoint, {
        wsEndpoint: endpoint.replace('http', 'ws'), // Assumes standard ws endpoint pattern
        commitment: this.commitment
      });
      
      // Test the connection
      const blockHeight = await this.connection.getBlockHeight();
      logger.info(`Connected successfully, current block height: ${blockHeight}`);
      
      this.isConnected = true;
      this.reconnectAttempt = 0;
      
      // Start health check interval
      this.startHealthCheck();
      
      return true;
    } catch (error) {
      logger.error(`Failed to connect: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Starts the health check interval
   */
  startHealthCheck() {
    // Clear any existing interval
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
    
    // Set up new interval
    this.healthCheckIntervalId = setInterval(
      this.checkHealth,
      this.healthCheckInterval
    );
    
    logger.debug(`Health check started, interval: ${this.healthCheckInterval}ms`);
  }
  
  /**
   * Checks connection health and reconnects if necessary
   */
  async checkHealth() {
    if (!this.connection) {
      logger.warn('No active connection, attempting to connect');
      await this.connect();
      return;
    }
    
    try {
      // Simple health check: get latest block height
      await this.connection.getBlockHeight();
      logger.debug('WebSocket connection health check passed');
    } catch (error) {
      logger.warn(`WebSocket connection health check failed: ${error.message}`);
      await this.reconnect();
    }
  }
  
  /**
   * Attempts to reconnect to the WebSocket
   * Uses exponential backoff and tries fallback endpoints
   * @returns {Promise<boolean>} - True if reconnected successfully
   */
  async reconnect() {
    this.isConnected = false;
    this.reconnectAttempt++;
    
    if (this.reconnectAttempt > this.maxReconnectAttempts) {
      logger.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      return false;
    }
    
    // Calculate backoff delay with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 30000);
    const jitter = Math.random() * 0.5 + 0.75; // 0.75-1.25 multiplier
    const delay = Math.floor(baseDelay * jitter);
    
    logger.info(`Reconnecting (attempt ${this.reconnectAttempt}/${this.maxReconnectAttempts}) in ${delay}ms...`);
    
    // Use next endpoint on reconnect
    const endpoint = this.getEndpoint(true);
    logger.info(`Trying endpoint: ${endpoint}`);
    
    // Wait for the backoff delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Attempt to establish a new connection
    const connected = await this.connect();
    
    if (connected) {
      logger.info('Reconnected successfully');
      
      // Restore subscriptions
      this.restoreSubscriptions();
      
      return true;
    }
    
    // If still not connected, try again
    logger.warn('Reconnection failed, will retry');
    return this.reconnect();
  }
  
  /**
   * Restores all active subscriptions after a reconnection
   */
  async restoreSubscriptions() {
    const subscriptionEntries = Array.from(this.subscriptions.entries());
    
    // Clear existing subscriptions since they're no longer valid
    this.subscriptions.clear();
    
    // Restore each subscription
    for (const [oldId, info] of subscriptionEntries) {
      try {
        if (info.type === 'logs') {
          const { programId, callback, commitment, filter } = info;
          
          logger.info(`Restoring logs subscription for program ${programId}`);
          
          const newId = await this.subscribeToLogs(programId, callback, {
            commitment,
            filter
          });
          
          logger.info(`Restored subscription: ${oldId} → ${newId}`);
        }
        // Add other subscription types as needed
      } catch (error) {
        logger.error(`Failed to restore subscription ${oldId}: ${error.message}`);
      }
    }
  }
  
  /**
   * Subscribes to program logs
   * @param {string|PublicKey} programId - Program ID to subscribe to
   * @param {Function} callback - Callback function to handle log notifications
   * @param {Object} options - Subscription options
   * @returns {Promise<number>} - Subscription ID
   */
  async subscribeToLogs(programId, callback, options = {}) {
    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect WebSocket');
      }
    }
    
    try {
      // Convert string to PublicKey if needed
      const pubkey = typeof programId === 'string' ? 
        new PublicKey(programId) : programId;
      
      // Subscribe to logs
      const subscriptionId = this.connection.onLogs(
        pubkey,
        callback,
        options.commitment || this.commitment
      );
      
      // Store subscription info
      this.subscriptions.set(subscriptionId, {
        type: 'logs',
        programId: pubkey.toString(),
        callback,
        commitment: options.commitment || this.commitment,
        filter: options.filter,
        timestamp: Date.now()
      });
      
      logger.info(`Subscribed to logs for program ${pubkey.toString()}, id: ${subscriptionId}`);
      
      return subscriptionId;
    } catch (error) {
      logger.error(`Failed to subscribe to logs: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Unsubscribes from a subscription
   * @param {number} subscriptionId - Subscription ID to unsubscribe
   * @returns {Promise<boolean>} - True if unsubscribed successfully
   */
  async unsubscribe(subscriptionId) {
    if (!this.connection || !this.subscriptions.has(subscriptionId)) {
      return false;
    }
    
    try {
      await this.connection.removeOnLogsListener(subscriptionId);
      this.subscriptions.delete(subscriptionId);
      
      logger.info(`Unsubscribed from subscription ${subscriptionId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to unsubscribe from ${subscriptionId}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Closes the WebSocket connection and cleans up resources
   */
  async close() {
    logger.info('Closing WebSocket connection');
    
    // Clear health check interval
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    // Unsubscribe from all subscriptions
    for (const subscriptionId of this.subscriptions.keys()) {
      await this.unsubscribe(subscriptionId);
    }
    
    this.isConnected = false;
    this.connection = null;
    
    logger.info('WebSocket connection closed');
  }
}

module.exports = WebSocketManager;