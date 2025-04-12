/**
 * @fileoverview Redis connection helper for Solana memecoin sniping bot
 * Creates Redis clients with proper connection handling for Docker environment
 */

const Redis = require('ioredis');
const { createLogger } = require('./logger');

// Initialize logger
const logger = createLogger('redis-helper');

/**
 * Creates a new Redis client with proper retry strategy
 * @param {Object} options - Redis connection options
 * @param {string} context - Logging context for the client
 * @returns {Redis} - Configured Redis client
 */
function createRedisClient(options = {}, context = 'redis') {
  const clientLogger = createLogger(context);
  
  const defaultOptions = {
    host: process.env.REDIS_HOST || 'redis', // Use service name in Docker
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    retryStrategy: times => {
      const delay = Math.min(times * 50, 2000);
      clientLogger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 20,
    enableReadyCheck: true,
    connectTimeout: 10000
  };

  // Merge default options with provided options
  const finalOptions = { ...defaultOptions, ...options };
  
  // Create Redis client
  const client = new Redis(finalOptions);
  
  // Log connection events
  client.on('connect', () => {
    clientLogger.info(`Connected to Redis at ${finalOptions.host}:${finalOptions.port}`);
  });
  
  client.on('ready', () => {
    clientLogger.info('Redis client ready');
  });
  
  client.on('error', (error) => {
    clientLogger.error(`Redis error: ${error.message}`);
  });
  
  client.on('close', () => {
    clientLogger.warn('Redis connection closed');
  });
  
  client.on('reconnecting', (delay) => {
    clientLogger.info(`Reconnecting to Redis in ${delay}ms`);
  });
  
  return client;
}

/**
 * Creates a Redis subscriber client
 * @param {string} context - Logging context
 * @returns {Redis} - Redis client configured for subscribing
 */
function createSubscriber(context = 'subscriber') {
  return createRedisClient({ 
    connectionName: `${context}-subscriber` 
  }, context);
}

/**
 * Creates a Redis publisher client
 * @param {string} context - Logging context
 * @returns {Redis} - Redis client configured for publishing
 */
function createPublisher(context = 'publisher') {
  return createRedisClient({ 
    connectionName: `${context}-publisher` 
  }, context);
}

module.exports = {
  createRedisClient,
  createSubscriber,
  createPublisher
};