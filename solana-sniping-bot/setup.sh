#!/bin/bash

# Solana Memecoin Sniping Bot Setup and Start Script
# This script will prepare the environment and start the bot in detached mode

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Solana Memecoin Sniping Bot Setup ===${NC}"

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
echo -e "${YELLOW}Creating log directories...${NC}"
mkdir -p logs/errors logs/transactions

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env file with your configuration before starting the bot.${NC}"
        echo -e "${YELLOW}Most importantly, set your WALLET_SECRET_KEY.${NC}"
        exit 1
    else
        echo -e "${RED}.env.example not found. Please create a .env file manually.${NC}"
        exit 1
    fi
fi

# Build Docker images
echo -e "${YELLOW}Building Docker images...${NC}"
docker compose build

# Start in detached mode
echo -e "${YELLOW}Starting services in detached mode...${NC}"
docker compose up -d

# Check if services are running
echo -e "${YELLOW}Checking service status...${NC}"
docker compose ps

echo -e "${GREEN}Setup complete! The bot is now running in the background.${NC}"
echo -e "${YELLOW}You can monitor logs with: docker-compose logs -f${NC}"
echo -e "${YELLOW}You can stop the bot with: docker-compose down${NC}"
echo -e "${YELLOW}API server is accessible at: http://localhost:3000${NC}"