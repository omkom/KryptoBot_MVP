# Simplified Dockerfile for token-filter
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
COPY ./services/token-filter/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/token-filter/src ./service/src/

# Set environment variables
ENV SERVICE=token-filter \
    NODE_ENV=production \
    NODE_PATH=/usr/src/app

# Command to run the service directly
CMD ["node", "service/src/index.js"]
