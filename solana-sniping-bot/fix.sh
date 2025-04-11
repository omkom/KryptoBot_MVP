#!/usr/bin/env node

/**
 * This script fixes require paths in all service files to use consistent imports
 * It should be run from the project root directory
 */

const fs = require('fs');
const path = require('path');

// Service directories to process
const serviceDirectories = [
  'services/api-server/src',
  'services/buy-executor/src',
  'services/lp-monitor/src',
  'services/sell-manager/src',
  'services/token-filter/src'
];

// Patterns to match problematic imports
const patterns = [
  {
    // Absolute paths like /usr/src/app/shared/...
    regex: /require\(['"]\/usr\/src\/app\/shared\/([^'"]+)['"]\)/g,
    replacement: "require('shared/$1')"
  },
  {
    // Relative paths using ../../../shared
    regex: /require\(['"]\.\.\/\.\.\/\.\.\/shared\/([^'"]+)['"]\)/g,
    replacement: "require('shared/$1')"
  },
  {
    // Relative paths using ./shared
    regex: /require\(['"]\.\/shared\/([^'"]+)['"]\)/g,
    replacement: "require('shared/$1')"
  }
];

// Process a single file
function processFile(filePath) {
  console.log(`Processing ${filePath}`);
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Apply each pattern
    for (const pattern of patterns) {
      const originalContent = content;
      content = content.replace(pattern.regex, pattern.replacement);
      if (content !== originalContent) {
        modified = true;
      }
    }
    
    // Only write back if changes were made
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`  Modified ${filePath}`);
    } else {
      console.log(`  No changes needed in ${filePath}`);
    }
  } catch (error) {
    console.error(`  Error processing ${filePath}: ${error.message}`);
  }
}

// Process all JS files in a directory recursively
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.js')) {
      processFile(filePath);
    }
  }
}

// Main function
function main() {
  console.log('Fixing require paths in service files...');
  
  // Process each service directory
  for (const dir of serviceDirectories) {
    if (fs.existsSync(dir)) {
      console.log(`\nProcessing directory: ${dir}`);
      processDirectory(dir);
    } else {
      console.log(`Directory not found: ${dir}`);
    }
  }
  
  console.log('\nDone fixing require paths');
}

main();