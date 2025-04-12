# Service-specific Dockerfile for lp-monitor
ARG NODE_VERSION=18

# Build stage - uses the base image as a starting point
FROM solana-bot-base:18 AS base

# Set our service argument
ARG SERVICE_NAME=lp-monitor

# Copy shared module files
COPY ./shared /usr/src/app/shared/

# Copy service package files
COPY ./services/${SERVICE_NAME}/package*.json ./service/

# Install service dependencies
WORKDIR /usr/src/app/service
RUN npm ci --only=production
WORKDIR /usr/src/app

# Copy service code
COPY ./services/${SERVICE_NAME}/src ./service/src/

# Create health check endpoint
RUN echo 'const http = require("http"); \
const server = http.createServer((req, res) => { \
  if (req.url === "/health") { \
    res.writeHead(200, {"Content-Type": "application/json"}); \
    res.end(JSON.stringify({status: "ok", service: "lp-monitor"})); \
  } else { \
    res.writeHead(404); res.end(); \
  } \
}); \
server.listen(3001, () => console.log("Health check running on :3001")); \
require("./service/src/index.js");' > /usr/src/app/server.js

# Set environment variables
ENV SERVICE=${SERVICE_NAME} \
    NODE_ENV=production \
    NODE_PATH=/usr/src/app

# Expose health check port
EXPOSE 3001

# Command to run the service with health check
CMD ["node", "server.js"]