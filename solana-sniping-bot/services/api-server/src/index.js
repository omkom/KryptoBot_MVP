/**
 * @fileoverview API Server for Solana Memecoin Sniping Bot
 * Provides monitoring endpoints and real-time updates via Socket.io
 * With added port conflict resolution
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const Redis = require('ioredis');
const { createSubscriber, createPublisher } = require('shared/redis-helper');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('shared/logger');
const config = require('shared/config').default;
const { REDIS_CHANNELS } = require('shared/constants');
const portChecker = require('./port-checker');

// Initialize logger
const logger = createLogger('api-server');

// Parse port configurations with fallbacks
const API_SERVER_PORT = parseInt(process.env.API_SERVER_PORT || '3000', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3000', 10);

// Initialize Express app
const app = express();
let server;

// Initialize Redis client for subscribing to events
const redisSubscriber = createSubscriber('api-server');
const redisPublisher = createPublisher('api-server');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple authentication middleware - enhance for production
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // For development - in production use a secure API key comparison
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Status endpoint - requires authentication
app.get('/api/status', authenticate, async (req, res) => {
  try {
    // Query Redis for service heartbeats
    const redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || ''
    });
    
    // Get latest heartbeats from Redis (if implemented)
    const serviceStatus = {};
    const services = ['lp-monitor', 'token-filter', 'buy-executor', 'sell-manager'];
    
    for (const service of services) {
      const lastHeartbeat = await redisClient.get(`heartbeat:${service}`);
      serviceStatus[service] = {
        status: lastHeartbeat ? 'active' : 'unknown',
        lastHeartbeat: lastHeartbeat || 'N/A'
      };
    }
    
    // Get trading stats (optional, if implemented)
    const buyCount = await redisClient.get('stats:buy_count') || '0';
    const sellCount = await redisClient.get('stats:sell_count') || '0';
    
    // Close temporary Redis connection
    redisClient.quit();
    
    res.status(200).json({
      bot: {
        version: '1.0.0',
        uptime: process.uptime(),
      },
      services: serviceStatus,
      stats: {
        buys: parseInt(buyCount, 10),
        sells: parseInt(sellCount, 10)
      }
    });
  } catch (error) {
    logger.error(`Status endpoint error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Logs endpoint - streams recent log entries
app.get('/api/logs/:service?', authenticate, (req, res) => {
  try {
    const service = req.params.service || 'api-server';
    const lines = req.query.lines ? parseInt(req.query.lines, 10) : 100;
    const logPath = path.join(process.cwd(), 'logs', `${service}.log`);
    
    // Check if log file exists
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({ error: `No logs found for service: ${service}` });
    }
    
    // Read the last N lines of the log file
    // This is a simplified implementation - for production consider using a streaming solution
    const data = fs.readFileSync(logPath, 'utf8');
    const logLines = data.trim().split('\n');
    const recentLogs = logLines.slice(-lines).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { raw: line };
      }
    });
    
    res.status(200).json(recentLogs);
  } catch (error) {
    logger.error(`Logs endpoint error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Transaction logs endpoint
app.get('/api/transactions', authenticate, (req, res) => {
  try {
    const service = req.query.service || 'buy-executor';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const logPath = path.join(process.cwd(), 'logs', 'transactions', `${service}-transactions.log`);
    
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({ error: `No transaction logs found for service: ${service}` });
    }
    
    const data = fs.readFileSync(logPath, 'utf8');
    const logLines = data.trim().split('\n');
    const recentTransactions = logLines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { raw: line };
      }
    });
    
    res.status(200).json(recentTransactions);
  } catch (error) {
    logger.error(`Transaction logs endpoint error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch transaction logs' });
  }
});

// Socket.io configuration will be set once server is created
let io;

// Redis subscription setup for Socket.io forwarding
redisSubscriber.on('ready', () => {
  logger.info('Redis subscriber connected successfully');
  
  // Subscribe to relevant Redis channels
  redisSubscriber.subscribe(REDIS_CHANNELS.LOGS);
  redisSubscriber.subscribe(REDIS_CHANNELS.NEW_POOLS);
  redisSubscriber.subscribe(REDIS_CHANNELS.SUCCESSFUL_BUYS);
  redisSubscriber.subscribe(REDIS_CHANNELS.SUCCESSFUL_SELLS);
  
  logger.info('Subscribed to Redis channels');
});

// Handle Redis messages and forward to Socket.io
redisSubscriber.on('message', (channel, message) => {
  if (!io) return; // Skip if Socket.io isn't initialized yet
  
  try {
    const data = JSON.parse(message);
    
    // Forward to appropriate Socket.io rooms based on channel
    switch (channel) {
      case REDIS_CHANNELS.LOGS:
        io.to('logs').emit('log', data);
        break;
      
      case REDIS_CHANNELS.NEW_POOLS:
        io.to('pools').emit('new_pool', data);
        break;
      
      case REDIS_CHANNELS.SUCCESSFUL_BUYS:
        io.to('transactions').emit('buy', data);
        break;
      
      case REDIS_CHANNELS.SUCCESSFUL_SELLS:
        io.to('transactions').emit('sell', data);
        break;
      
      default:
        logger.debug(`Received message on unhandled channel: ${channel}`);
    }
  } catch (error) {
    logger.error(`Error processing Redis message: ${error.message}`);
  }
});

// Handle Redis connection errors
redisSubscriber.on('error', (error) => {
  logger.error(`Redis subscriber error: ${error.message}`);
});

/**
 * Creates and starts the health check HTTP server
 * @param {number} port - Port for the health server
 * @returns {Promise<http.Server>} - The created server
 */
async function startHealthServer(port) {
  const healthApp = express();
  
  // Simple health endpoint
  healthApp.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'api-server',
      timestamp: new Date().toISOString()
    });
  });
  
  // Find an available port for health check server
  const healthPort = await portChecker.findAvailablePort(port);
  if (healthPort === -1) {
    logger.error(`Could not find available port for health check server starting from ${port}`);
    throw new Error(`No available port found for health check server`);
  }
  
  return new Promise((resolve, reject) => {
    const healthServer = healthApp.listen(healthPort, () => {
      logger.info(`Health check server running on port ${healthPort}`);
      resolve(healthServer);
    }).on('error', (err) => {
      logger.error(`Failed to start health server: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Starts the main API server
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    // Check if API server port is available or find one that is
    const apiPort = await portChecker.findAvailablePort(API_SERVER_PORT);
    if (apiPort === -1) {
      logger.error(`Could not find available port for API server starting from ${API_SERVER_PORT}`);
      throw new Error(`No available port found for API server`);
    }
    
    // Start health check server on a different port if needed
    let healthServer;
    if (HEALTH_PORT === API_SERVER_PORT) {
      // Use a different port for health server
      healthServer = await startHealthServer(HEALTH_PORT + 1);
    } else {
      healthServer = await startHealthServer(HEALTH_PORT);
    }
    
    // Create HTTP server
    server = http.createServer(app);
    
    // Initialize Socket.io
    io = socketIo(server, {
      cors: {
        origin: "*", // In production, restrict this to specific origins
        methods: ["GET", "POST"]
      }
    });
    
    // Socket.io connection handling
    io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      // Subscribe to log events when client requests
      socket.on('subscribe:logs', () => {
        socket.join('logs');
        logger.debug(`Client ${socket.id} subscribed to logs`);
      });
      
      // Subscribe to transaction events
      socket.on('subscribe:transactions', () => {
        socket.join('transactions');
        logger.debug(`Client ${socket.id} subscribed to transactions`);
      });
      
      // Subscribe to pool detection events
      socket.on('subscribe:pools', () => {
        socket.join('pools');
        logger.debug(`Client ${socket.id} subscribed to pool events`);
      });
      
      // Handle client disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
    
    // Start the server
    server.listen(apiPort, () => {
      logger.info(`API server listening on port ${apiPort}`);
    });
    
    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      // Close the health check server
      if (healthServer) {
        await new Promise(resolve => healthServer.close(resolve));
        logger.info('Health check server closed');
      }
      
      // Close HTTP server
      if (server) {
        await new Promise(resolve => server.close(resolve));
        logger.info('HTTP server closed');
      }
      
      // Close Redis connections
      redisSubscriber.quit();
      
      // Give everything 5 seconds to close, then exit
      setTimeout(() => {
        logger.info('Shutting down process');
        process.exit(0);
      }, 5000);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}\n${error.stack}`);
  
  // Exit with error code for container orchestration to restart
  process.exit(1);
});

// Start the server
startServer();