# Service-specific Dockerfile
# Template for services/[service-name]/Dockerfile
ARG NODE_VERSION=18

# Extend from the base image
FROM solana-bot-base:${NODE_VERSION} AS base

# Set service name for reference
ARG SERVICE_NAME=undefined

# Copy service package files
COPY ./services/${SERVICE_NAME}/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm install --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/${SERVICE_NAME}/src ./service/src/

# Set any service-specific environment variables
ENV SERVICE=${SERVICE_NAME} \
    NODE_ENV=production

# Command to run the service
CMD ["node", "service/src/index.js"]