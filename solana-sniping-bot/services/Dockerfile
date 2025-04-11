# Simplified base Dockerfile for all services
ARG NODE_VERSION=18

FROM node:${NODE_VERSION}-alpine

# Set working directory
WORKDIR /usr/src/app

# Install common dependencies
RUN apk add --no-cache tzdata curl

# Create necessary directories
RUN mkdir -p ./shared ./service/src ./logs/errors ./logs/transactions

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
ARG SERVICE_NAME
COPY ./services/${SERVICE_NAME}/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/${SERVICE_NAME}/src ./service/src/

# Set environment variables
ENV SERVICE=${SERVICE_NAME} \
    NODE_ENV=production \
    NODE_PATH=/usr/src/app

# Command to run the service directly
CMD ["node", "service/src/index.js"]
