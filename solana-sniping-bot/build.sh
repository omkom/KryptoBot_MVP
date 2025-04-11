#!/bin/bash

# Build script for the Solana Memecoin Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Ensure all required source files exist
echo -e "${YELLOW}Checking required files...${NC}"
if [ ! -f "shared/package.json" ]; then
    echo -e "${RED}shared/package.json is missing. Please create it first.${NC}"
    exit 1
fi

if [ ! -f "shared/config.js" ]; then
    echo -e "${RED}shared/config.js is missing.${NC}"
    exit 1
fi

if [ ! -f "shared/constants.js" ]; then
    echo -e "${RED}shared/constants.js is missing.${NC}"
    exit 1
fi

if [ ! -f "shared/logger.js" ]; then
    echo -e "${RED}shared/logger.js is missing.${NC}"
    exit 1
fi

if [ ! -f "shared/connection.js" ]; then
    echo -e "${RED}shared/connection.js is missing.${NC}"
    exit 1
fi

if [ ! -f "shared/wallet.js" ]; then
    echo -e "${RED}shared/wallet.js is missing.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env file with your configuration before starting the bot.${NC}"
        echo -e "${YELLOW}Most importantly, set your WALLET_SECRET_KEY.${NC}"
    else
        echo -e "${RED}.env.example not found. Please create a .env file manually.${NC}"
        exit 1
    fi
fi

# Build base image first
echo -e "${YELLOW}Building base Docker image...${NC}"
docker compose build base-image

# Build service images
echo -e "${YELLOW}Building service images...${NC}"
docker compose build

echo -e "${GREEN}Build complete! You can now start the bot with:${NC}"
echo -e "${YELLOW}docker compose up -d${NC}"