#!/bin/bash

# Startup script for Solana Memecoin Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Starting Solana Memecoin Sniping Bot ===${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo -e "${YELLOW}Please create a .env file by copying .env.example and configuring your settings${NC}"
    exit 1
fi

# Check for wallet configuration
WALLET_KEY=$(grep WALLET_SECRET_KEY .env | cut -d '=' -f2)
if [ "$WALLET_KEY" = "YOUR_WALLET_SECRET_KEY_HERE" ] || [ -z "$WALLET_KEY" ]; then
    echo -e "${RED}Error: Wallet secret key not configured in .env${NC}"
    echo -e "${YELLOW}Please edit your .env file and set your WALLET_SECRET_KEY${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo -e "${YELLOW}Please start Docker and try again${NC}"
    exit 1
fi

# Check if services are already running
if [ "$(docker compose ps -q | wc -l)" -gt 0 ]; then
    echo -e "${YELLOW}Some services are already running. Stopping them first...${NC}"
    docker compose down
fi

# Start the bot with selected mode
if [ "$1" = "detached" ] || [ "$1" = "-d" ]; then
    echo -e "${YELLOW}Starting bot in detached mode...${NC}"
    docker compose up -d
    
    echo -e "${GREEN}Bot started successfully in detached mode!${NC}"
    echo -e "${BLUE}To view logs, run:${NC} docker compose logs -f"
    echo -e "${BLUE}To stop the bot, run:${NC} docker compose down"
    echo -e "${BLUE}API Server:${NC} http://localhost:3000"
else
    echo -e "${YELLOW}Starting bot in interactive mode with logs...${NC}"
    echo -e "${BLUE}Press Ctrl+C to stop the bot${NC}"
    docker compose up
fi