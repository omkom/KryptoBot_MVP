#!/bin/bash

# Diagnostic tool for Solana Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Solana Sniping Bot Diagnostic Tool ===${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo -e "${YELLOW}Please start Docker and try again${NC}"
    exit 1
fi

# Check container status
echo -e "${BLUE}Container Status:${NC}"
docker compose ps

# Check container logs for errors
echo -e "\n${BLUE}Checking for errors in container logs:${NC}"
for service in redis lp-monitor token-filter buy-executor sell-manager api-server; do
    echo -e "${YELLOW}$service:${NC}"
    docker compose logs --tail=20 $service | grep -i "error\|exception\|fail" || echo "No errors found"
    echo ""
done

# Check Redis connectivity
echo -e "${BLUE}Testing Redis connectivity:${NC}"
docker compose exec redis redis-cli ping || echo -e "${RED}Failed to connect to Redis${NC}"

# Check if logs directory exists and has proper permissions
echo -e "\n${BLUE}Checking logs directory:${NC}"
if [ -d "logs" ]; then
    echo "Logs directory exists"
    ls -la logs
else
    echo -e "${RED}Logs directory does not exist${NC}"
    mkdir -p logs/errors logs/transactions
    echo "Created logs directory"
fi

# Check network connectivity between containers
echo -e "\n${BLUE}Testing inter-container connectivity:${NC}"
docker compose exec token-filter ping -c 1 redis || echo -e "${RED}Network connectivity issue between token-filter and redis${NC}"

echo -e "\n${GREEN}Diagnostic complete!${NC}"
