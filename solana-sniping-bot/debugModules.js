/**
 * Debug script to help diagnose Node.js module resolution issues
 * Run with: docker compose exec lp-monitor node /usr/src/app/debugModules.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== Node.js Module Resolution Debug Tool ===\n');

// System info
console.log('NODE VERSION:', process.version);
console.log('PLATFORM:', process.platform);
console.log('CURRENT DIRECTORY:', process.cwd());
console.log('NODE_PATH:', process.env.NODE_PATH || '(not set)');
console.log('MODULE PATHS:', module.paths);

// Directory structure
console.log('\n=== Directory Structure ===');

function listDir(dir, indent = 0) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      console.log(`${' '.repeat(indent)}${item}${stats.isDirectory() ? '/' : ''}`);
      
      if (stats.isDirectory() && indent < 6) { // Limit recursion depth
        listDir(itemPath, indent + 2);
      }
    }
  } catch (error) {
    console.log(`${' '.repeat(indent)}Error reading directory: ${error.message}`);
  }
}

// List important directories
console.log('\nRoot directory:');
listDir('/usr/src/app', 2);

// Try to resolve important modules
console.log('\n=== Module Resolution Tests ===');
function testRequire(modulePath) {
  try {
    const resolved = require.resolve(modulePath);
    console.log(`✅ ${modulePath} -> ${resolved}`);
    return true;
  } catch (error) {
    console.log(`❌ ${modulePath} -> ${error.message}`);
    return false;
  }
}

console.log('\nTesting shared module imports:');
testRequire('shared/logger');
testRequire('shared/config');
testRequire('shared/constants');
testRequire('shared/connection');
testRequire('shared/wallet');

console.log('\nTesting relative imports:');
testRequire('../shared/logger');
testRequire('./shared/logger');

console.log('\nTesting npm dependencies:');
testRequire('ioredis');
testRequire('@solana/web3.js');

// Check file content of shared modules
console.log('\n=== Module Content Check ===');
function checkFileContent(filePath) {
  try {
    const exists = fs.existsSync(filePath);
    if (exists) {
      const stats = fs.statSync(filePath);
      const sizeInKB = (stats.size / 1024).toFixed(2);
      console.log(`✅ ${filePath} exists (${sizeInKB} KB)`);
      
      // Show first few lines
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').slice(0, 3).join('\n');
      console.log(`   First lines: ${lines.substring(0, 100)}...`);
    } else {
      console.log(`❌ ${filePath} does not exist`);
    }
  } catch (error) {
    console.log(`❌ Error checking ${filePath}: ${error.message}`);
  }
}

console.log('\nChecking shared module files:');
checkFileContent('/usr/src/app/shared/logger.js');
checkFileContent('/usr/src/app/shared/config.js');
checkFileContent('/usr/src/app/shared/constants.js');

console.log('\n=== Complete ===');
