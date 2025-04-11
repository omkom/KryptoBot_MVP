# Service-specific Dockerfile for token-filter
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

# Create debug script to check environment
RUN echo '#!/bin/sh\necho "Service: token-filter"\necho "Service directories:"\nls -la /usr/src/app\necho "\nShared modules:"\nls -la /usr/src/app/shared\necho "\nService files:"\nls -la /usr/src/app/service/src\necho "\nStarting service..."\nnode /usr/src/app/service/src/index.js' > /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Command to run the service
CMD ["/usr/src/app/start.sh"]
