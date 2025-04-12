/**
 * @fileoverview Docker Fix Script for Solana Memecoin Sniping Bot
 * Creates a start.sh script in the root directory for all services
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// List of services that need the start.sh script
const services = ['lp-monitor', 'token-filter', 'buy-executor', 'sell-manager', 'api-server'];

// Start script content
const startScript = `#!/bin/sh
# Start script for Solana Sniping Bot services
echo "Starting service: \${SERVICE}"
echo "Working directory: $(pwd)"
echo "Node path: \${NODE_PATH}"
echo "Starting Node.js application..."
node service/src/index.js
`;

console.log(chalk.green('=== Creating start.sh scripts for all services ==='));

// Create the start.sh in the project root
fs.writeFileSync('start.sh', startScript, { mode: 0o755 });
console.log(chalk.blue('Created start.sh in project root'));

// Ensure it's executable
try {
  fs.chmodSync('start.sh', '755');
  console.log(chalk.blue('Made start.sh executable'));
} catch (error) {
  console.log(chalk.yellow('Note: Could not set executable permissions. This is fine on Windows.'));
}

console.log(chalk.green('=== All fixes applied successfully! ==='));
console.log(chalk.blue('You can now run the services with docker compose up'));