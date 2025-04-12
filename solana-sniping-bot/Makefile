# Solana Memecoin Sniping Bot Makefile
# Provides convenient commands for docker operations

.PHONY: build start stop restart logs ps clean prune build-base dev test

# Default environment
ENV ?= prod

# Docker Compose files
DC_PROD = docker compose.yml
DC_DEV = docker compose.dev.yml

# Docker Compose command
ifeq ($(ENV),dev)
	DC = docker compose -f $(DC_PROD) -f $(DC_DEV)
else
	DC = docker compose -f $(DC_PROD)
endif

# Build the base image first, then all services
build-base:
	@echo "Building base image..."
	@docker compose -f $(DC_PROD) build base-image

# Build all services
build: build-base
	@echo "Building all services ($(ENV) mode)..."
	@$(DC) build

# Start all services
start:
	@echo "Starting services in $(ENV) mode..."
	@$(DC) up -d

# Stop all services
stop:
	@echo "Stopping all services..."
	@$(DC) down

# Restart all services
restart: stop start

# Show logs for all or a specific service
# Usage: make logs [SERVICE=service-name]
logs:
ifdef SERVICE
	@$(DC) logs -f $(SERVICE)
else
	@$(DC) logs -f
endif

# Show running containers
ps:
	@$(DC) ps

# Remove containers, networks, volumes
clean:
	@echo "Removing containers, networks, volumes..."
	@$(DC) down -v --remove-orphans

# Clean unused Docker resources
prune:
	@echo "Pruning Docker system..."
	@docker system prune -f

# Start in development mode
dev:
	@$(MAKE) ENV=dev start

# Run tests (placeholder)
test:
	@echo "Running tests..."
	@$(DC) exec lp-monitor npm test

# Show container statistics
stats:
	@docker stats

# Execute a shell in a container
# Usage: make shell SERVICE=service-name
shell:
ifdef SERVICE
	@$(DC) exec $(SERVICE) /bin/sh
else
	@echo "Error: Specify a service name with SERVICE=<service-name>"
	@exit 1
endif

# Display this help
help:
	@echo "Solana Memecoin Sniping Bot Commands:"
	@echo "  make build        - Build all services"
	@echo "  make build-base   - Build base image only"
	@echo "  make start        - Start all services in production mode"
	@echo "  make dev          - Start all services in development mode"
	@echo "  make stop         - Stop all services"
	@echo "  make restart      - Restart all services"
	@echo "  make logs         - View logs from all services"
	@echo "  make logs SERVICE=<name> - View logs for a specific service"
	@echo "  make ps           - List running containers"
	@echo "  make clean        - Remove containers, networks, volumes"
	@echo "  make prune        - Clean unused Docker resources"
	@echo "  make shell SERVICE=<name> - Open shell in a container"
	@echo "  make stats        - Show container statistics"
	@echo "  make test         - Run tests"