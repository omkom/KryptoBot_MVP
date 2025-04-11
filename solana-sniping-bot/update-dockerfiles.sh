#!/bin/bash

# Script to update all service Dockerfiles
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Updating all service Dockerfiles ===${NC}"

# List of services
SERVICES=("lp-monitor" "token-filter" "buy-executor" "sell-manager" "api-server")

for SERVICE in "${SERVICES[@]}"; do
  echo -e "${YELLOW}Creating Dockerfile for $SERVICE...${NC}"
  
  cat > services/$SERVICE/Dockerfile << EOF
# Simplified Dockerfile for $SERVICE
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/$SERVICE/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/$SERVICE/src ./service/src/

# Set environment variables
ENV SERVICE=$SERVICE \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF

  echo -e "${GREEN}Created Dockerfile for $SERVICE${NC}"
done

echo -e "${GREEN}All Dockerfiles updated successfully!${NC}"
