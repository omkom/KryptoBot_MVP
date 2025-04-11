#!/bin/bash

# Enhanced fix script for the Solana Memecoin Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Fixing Solana Memecoin Sniping Bot Configuration ===${NC}"

# Create service-specific Dockerfiles
echo -e "${YELLOW}Creating service-specific Dockerfiles...${NC}"

# For lp-monitor
cat > services/lp-monitor/Dockerfile << EOF
# Service-specific Dockerfile for lp-monitor
ARG NODE_VERSION=18

FROM node:\${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/lp-monitor/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/lp-monitor/src ./service/src/

# Set environment variables
ENV SERVICE=lp-monitor \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Create debug script to check environment
RUN echo '#!/bin/sh\\necho "Service: lp-monitor"\\necho "Service directories:"\\nls -la /usr/src/app\\necho "\\nShared modules:"\\nls -la /usr/src/app/shared\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nStarting service..."\\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \\
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
EOF
echo -e "${GREEN}Created Dockerfile for lp-monitor${NC}"

# For token-filter
cat > services/token-filter/Dockerfile << EOF
# Service-specific Dockerfile for token-filter
ARG NODE_VERSION=18

FROM node:\${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/token-filter/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/token-filter/src ./service/src/

# Set environment variables
ENV SERVICE=token-filter \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Create debug script to check environment
RUN echo '#!/bin/sh\\necho "Service: token-filter"\\necho "Service directories:"\\nls -la /usr/src/app\\necho "\\nShared modules:"\\nls -la /usr/src/app/shared\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nStarting service..."\\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \\
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
EOF
echo -e "${GREEN}Created Dockerfile for token-filter${NC}"

# For buy-executor
cat > services/buy-executor/Dockerfile << EOF
# Service-specific Dockerfile for buy-executor
ARG NODE_VERSION=18

FROM node:\${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/buy-executor/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/buy-executor/src ./service/src/

# Set environment variables
ENV SERVICE=buy-executor \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Create debug script to check environment
RUN echo '#!/bin/sh\\necho "Service: buy-executor"\\necho "Service directories:"\\nls -la /usr/src/app\\necho "\\nShared modules:"\\nls -la /usr/src/app/shared\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nStarting service..."\\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \\
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
EOF
echo -e "${GREEN}Created Dockerfile for buy-executor${NC}"

# For sell-manager
cat > services/sell-manager/Dockerfile << EOF
# Service-specific Dockerfile for sell-manager
ARG NODE_VERSION=18

FROM node:\${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/sell-manager/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/sell-manager/src ./service/src/

# Set environment variables
ENV SERVICE=sell-manager \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Create debug script to check environment
RUN echo '#!/bin/sh\\necho "Service: sell-manager"\\necho "Service directories:"\\nls -la /usr/src/app\\necho "\\nShared modules:"\\nls -la /usr/src/app/shared\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nStarting service..."\\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \\
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
EOF
echo -e "${GREEN}Created Dockerfile for sell-manager${NC}"

# For api-server
cat > services/api-server/Dockerfile << EOF
# Service-specific Dockerfile for api-server
ARG NODE_VERSION=18

FROM node:\${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/api-server/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/api-server/src ./service/src/

# Set environment variables
ENV SERVICE=api-server \\
    NODE_ENV=production \\
    NODE_PATH=/usr/src/app

# Create debug script to check environment
RUN echo '#!/bin/sh\\necho "Service: api-server"\\necho "Service directories:"\\nls -la /usr/src/app\\necho "\\nShared modules:"\\nls -la /usr/src/app/shared\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nStarting service..."\\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \\
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
EOF
echo -e "${GREEN}Created Dockerfile for api-server${NC}"

echo -e "${GREEN}All service Dockerfiles have been created successfully!${NC}"
echo -e "${YELLOW}You can now build and run the services with docker-compose${NC}"
