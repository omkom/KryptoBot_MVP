#!/bin/bash

# Simplified fix script for the Solana Memecoin Sniping Bot
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Fixing Solana Memecoin Sniping Bot Configuration ===${NC}"

# Create service-specific Dockerfiles
echo -e "${YELLOW}Creating simplified service-specific Dockerfiles...${NC}"

# For lp-monitor
cat > services/lp-monitor/Dockerfile << EOF
# Simplified Dockerfile for lp-monitor
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

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF
echo -e "${GREEN}Created Dockerfile for lp-monitor${NC}"

# For token-filter
cat > services/token-filter/Dockerfile << EOF
# Simplified Dockerfile for token-filter
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

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF
echo -e "${GREEN}Created Dockerfile for token-filter${NC}"

# For buy-executor
cat > services/buy-executor/Dockerfile << EOF
# Simplified Dockerfile for buy-executor
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

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF
echo -e "${GREEN}Created Dockerfile for buy-executor${NC}"

# For sell-manager
cat > services/sell-manager/Dockerfile << EOF
# Simplified Dockerfile for sell-manager
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

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF
echo -e "${GREEN}Created Dockerfile for sell-manager${NC}"

# For api-server
cat > services/api-server/Dockerfile << EOF
# Simplified Dockerfile for api-server
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

# Command to run the service directly
CMD ["node", "service/src/index.js"]
EOF
echo -e "${GREEN}Created Dockerfile for api-server${NC}"

echo -e "${GREEN}All service Dockerfiles have been simplified successfully!${NC}"
echo -e "${YELLOW}You can now build and run the services with docker-compose${NC}"
