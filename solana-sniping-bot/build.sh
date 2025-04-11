#!/bin/bash

# Enhanced Build script for the Solana Memecoin Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Building Solana Memecoin Sniping Bot ===${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Create necessary directories
echo -e "${YELLOW}Creating directory structure...${NC}"
mkdir -p logs/errors logs/transactions shared/utils

# Normalize import paths in service files if script exists
if [ -f "fixRequirePaths.js" ]; then
    echo -e "${BLUE}Normalizing import paths in service files...${NC}"
    node fixRequirePaths.js
else
    echo -e "${YELLOW}fixRequirePaths.js not found, skipping path normalization${NC}"
fi

# Check if shared/package.json exists
if [ ! -f "shared/package.json" ]; then
    echo -e "${RED}shared/package.json is missing. Creating template...${NC}"
    
    cat > shared/package.json << EOF
{
  "name": "solana-sniping-bot-shared",
  "version": "1.0.0",
  "description": "Shared utilities for Solana Memecoin Sniping Bot",
  "main": "index.js",
  "private": true,
  "dependencies": {
    "@solana/web3.js": "^1.73.0",
    "@solana/spl-token": "^0.3.7",
    "bs58": "^5.0.0",
    "chalk": "^4.1.2",
    "dotenv": "^16.0.3",
    "winston": "^3.8.2"
  }
}
EOF
    
    echo -e "${YELLOW}Created shared/package.json template. Please review and update as needed.${NC}"
fi

# Create shared/index.js if it doesn't exist
if [ ! -f "shared/index.js" ]; then
    echo -e "${YELLOW}Creating shared/index.js...${NC}"
    
    cat > shared/index.js << EOF
/**
 * @fileoverview Main exports for the shared utilities
 * Provides centralized access to all shared modules
 */

// Re-export all shared modules
module.exports = {
  config: require('./config'),
  constants: require('./constants'),
  connection: require('./connection'),
  wallet: require('./wallet'),
  logger: require('./logger')
};
EOF
    
    echo -e "${YELLOW}Created shared/index.js${NC}"
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Created .env file from .env.example. Please edit with your configuration.${NC}"
    else
        echo -e "${RED}.env.example not found. Please create a .env file manually.${NC}"
        exit 1
    fi
fi

# Print Docker build context debug info
echo -e "${BLUE}=== Docker Build Context Info ===${NC}"
echo -e "${BLUE}Current directory: $(pwd)${NC}"
echo -e "${BLUE}Shared directory structure:${NC}"
find shared -type f | sort

echo -e "${BLUE}Service directory structure:${NC}"
find services -name "*.js" | grep -v "node_modules" | sort

# Stop any running containers
echo -e "${YELLOW}Stopping any existing containers...${NC}"
docker compose down || true

# Clean any existing images to ensure a fresh build
echo -e "${YELLOW}Cleaning previous images...${NC}"
docker rmi solana-bot-base:18 || true

# Build base image first
echo -e "${YELLOW}Building base Docker image...${NC}"
docker compose build base-image

# Build service images with extra verbosity
echo -e "${YELLOW}Building service images...${NC}"
docker compose build --progress=plain

echo -e "${GREEN}Build complete! You can now start the bot with:${NC}"
echo -e "${YELLOW}docker compose up -d${NC}"
echo -e "${GREEN}Check container logs with:${NC}"
echo -e "${YELLOW}docker compose logs -f${NC}"