# Service-specific Dockerfile
# Example: services/lp-monitor/Dockerfile
ARG NODE_VERSION=18

# Extend from the base image
FROM solana-bot-base:${NODE_VERSION} AS service-base

# Set service name for reference
ARG SERVICE_NAME

# Copy service package files
COPY ./services/${SERVICE_NAME}/package*.json ./service/

# Install service dependencies
RUN cd ./service && npm install --only=production

# Final service image
FROM service-base AS service

# Copy service code
COPY ./services/${SERVICE_NAME}/src ./service/src/

# Set any service-specific environment variables
ENV SERVICE=${SERVICE_NAME} \
    NODE_ENV=production

# Service-specific health check can be overridden here if needed

# Command can be overridden for service-specific needs
CMD ["node", "service/src/index.js"]