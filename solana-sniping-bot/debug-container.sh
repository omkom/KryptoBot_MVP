#!/bin/bash

# Debug script to help diagnose Docker container issues
set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVICE=$1

if [ -z "$SERVICE" ]; then
  echo -e "${RED}Error: Please specify a service name${NC}"
  echo -e "Usage: $0 <service-name>"
  echo -e "Available services: lp-monitor, token-filter, buy-executor, sell-manager, api-server"
  exit 1
fi

echo -e "${GREEN}=== Debugging $SERVICE container ===${NC}"

# Build a debug version of the service
echo -e "${YELLOW}Building debug container for $SERVICE...${NC}"

# Create a temporary debug Dockerfile
cat > services/$SERVICE/Dockerfile.debug << EOF
FROM node:18-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache tzdata curl bash

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

# Create debug script
RUN echo '#!/bin/bash\\n\\necho "=== Container Debug Info ==="\\necho "Current directory: \$(pwd)"\\necho "\\nDirectory structure:"\\nfind /usr/src/app -type d | sort\\necho "\\nService files:"\\nls -la /usr/src/app/service/src\\necho "\\nShared files:"\\nls -la /usr/src/app/shared\\necho "\\nNode path:"\\necho \$NODE_PATH\\necho "\\nNode modules:"\\nfind /usr/src/app -name "node_modules" | xargs ls -la\\necho "\\nTrying to run service..."\\nnode -e "try { require(\\"/usr/src/app/service/src/index.js\\"); } catch(e) { console.error(\\\"Error loading index.js:\\\", e); }"\\necho "\\nEntering shell..."\\n/bin/bash' > /usr/src/app/debug.sh
RUN chmod +x /usr/src/app/debug.sh

CMD ["/usr/src/app/debug.sh"]
EOF

# Build and run the debug container
docker build -t $SERVICE-debug -f services/$SERVICE/Dockerfile.debug .
docker run -it --rm --name $SERVICE-debug $SERVICE-debug

# Clean up
rm services/$SERVICE/Dockerfile.debug

echo -e "${GREEN}Debug session completed${NC}"
