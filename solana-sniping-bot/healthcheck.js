/**
 * Health check server for Solana Memecoin Sniping Bot services
 * 
 * This lightweight HTTP server provides a /health endpoint that returns
 * service status information. It's designed to be used by Docker health checks
 * and external monitoring systems.
 */

const http = require('http');
const os = require('os');

// Get service name from environment or use "unknown"
const SERVICE_NAME = process.env.SERVICE || 'unknown';
const PORT = process.env.HEALTH_PORT || getServicePort(SERVICE_NAME);
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

// Create the HTTP server
const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Only respond to GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  
  // Define status output based on path
  if (req.url === '/health') {
    // Basic health endpoint
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      environment: ENV
    }));
  } else if (req.url === '/health/details') {
    // Detailed health endpoint with system metrics
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      environment: ENV,
      metrics: getSystemMetrics()
    }));
  } else {
    // Not found for other paths
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

// Handle termination signals
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down health check server');
  server.close(() => {
    console.log('Health check server closed');
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down health check server');
  server.close(() => {
    console.log('Health check server closed');
  });
});

// Export healthcheck for use in service module
module.exports = { server };