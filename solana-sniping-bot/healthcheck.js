/**
 * Health check server for Solana Memecoin Sniping Bot services
 * 
 * This lightweight HTTP server provides a /health endpoint that returns
 * service status information. It's designed to be used by Docker health checks
 * and external monitoring systems.
 * 
 * Enhanced with port conflict resolution
 */

const http = require('http');
const express = require('express');
const os = require('os');
const net = require('net');

// Get service name from environment or use "unknown"
const SERVICE_NAME = process.env.SERVICE || 'unknown';
const PORT = parseInt(process.env.HEALTH_PORT || getServicePort(SERVICE_NAME), 10);
const ENV = process.env.NODE_ENV || 'production';

/**
 * Determine default port based on service name
 * @param {string} serviceName - Name of the service
 * @returns {number} - Port number
 */
function getServicePort(serviceName) {
  const portMap = {
    'lp-monitor': 3001,
    'token-filter': 3002,
    'buy-executor': 3003,
    'sell-manager': 3004,
    'api-server': 3000
  };
  
  return portMap[serviceName] || 3999;
}

/**
 * Get basic system metrics
 * @returns {Object} - System metrics
 */
function getSystemMetrics() {
  return {
    uptime: process.uptime(),
    memory: {
      free: os.freemem(),
      total: os.totalmem(),
      usage: process.memoryUsage()
    },
    cpu: os.loadavg()
  };
}

/**
 * Checks if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available, false if in use
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        // Some other error occurred
        console.error(`Error checking port ${port}:`, err.message);
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      // Close the server as we only wanted to check if the port is available
      server.close(() => {
        resolve(true); // Port is available
      });
    });
    
    server.listen(port);
  });
}

/**
 * Finds an available port starting from the given port
 * @param {number} startPort - Starting port number
 * @param {number} maxTries - Maximum number of ports to try
 * @returns {Promise<number>} - Available port or -1 if none found
 */
async function findAvailablePort(startPort, maxTries = 10) {
  for (let port = startPort; port < startPort + maxTries; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return -1; // No available port found
}

/**
 * Creates and starts the health check server
 * @returns {Promise<http.Server>} - The health check server instance
 */
async function startHealthServer() {
  // Create Express app for health check
  const app = express();
  
  // Set CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    
    next();
  });
  
  // Basic health endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      environment: ENV
    });
  });
  
  // Detailed health endpoint with system metrics
  app.get('/health/details', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      environment: ENV,
      metrics: getSystemMetrics()
    });
  });
  
  // Find an available port
  const availablePort = await findAvailablePort(PORT);
  if (availablePort === -1) {
    console.error(`Could not find available port for health check starting from ${PORT}`);
    throw new Error('No available ports found');
  }
  
  return new Promise((resolve, reject) => {
    const server = app.listen(availablePort, () => {
      console.log(`Health check server running on port ${availablePort}`);
      resolve(server);
    }).on('error', (err) => {
      console.error(`Failed to start health check server: ${err.message}`);
      reject(err);
    });
  });
}

// Start the health check server
let server;

// Don't start the health server if this file is being required by another module
if (require.main === module) {
  startHealthServer()
    .then(healthServer => {
      server = healthServer;
    })
    .catch(err => {
      console.error(`Failed to start health check server: ${err.message}`);
      process.exit(1);
    });
}

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down health check server');
  if (server) {
    server.close(() => {
      console.log('Health check server closed');
    });
  }
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down health check server');
  if (server) {
    server.close(() => {
      console.log('Health check server closed');
    });
  }
});

// Export utility functions and server for use in service modules
module.exports = {
  server,
  startHealthServer,
  isPortAvailable,
  findAvailablePort
};