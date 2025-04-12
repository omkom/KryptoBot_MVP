/**
 * @fileoverview Port availability checker utility for Solana memecoin sniping bot
 * Provides functions to check if a port is available before binding
 */

const net = require('net');

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

module.exports = {
  isPortAvailable,
  findAvailablePort
};