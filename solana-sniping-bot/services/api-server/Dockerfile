# Service-specific Dockerfile for ${SERVICE_NAME}
ARG NODE_VERSION=18

# Build using the base image
FROM solana-bot-base:18

# Service name argument
ARG SERVICE_NAME

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
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

# Expose health check port (override in docker-compose)
EXPOSE 3000

# Command to run healthcheck and service
CMD ["sh", "-c", "node healthcheck.js & node service/src/index.js"]