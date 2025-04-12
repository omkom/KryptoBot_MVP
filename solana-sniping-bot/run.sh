#!/bin/bash
# Run script for Solana Memecoin Sniping Bot
# Manages Docker container lifecycle and provides operational commands

set -e

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default configuration
MODE="prod"
ACTION="start"
SERVICE=""
LOGS=false

# Display the banner
function show_banner() {
    echo -e "${CYAN}"
    echo "  _____       _                         _____       _       _             ____        _   "
    echo " / ____|     | |                       / ____|     (_)     (_)           |  _ \      | |  "
    echo "| (___   ___ | | __ _ _ __   __ _     | (___  _ __  _ _ __  _ _ __   __ _| |_) | ___ | |_ "
    echo " \___ \ / _ \| |/ _\` | '_ \ / _\` |     \___ \| '_ \| | '_ \| | '_ \ / _\` |  _ < / _ \| __|"
    echo " ____) | (_) | | (_| | | | | (_| |     ____) | | | | | |_) | | | | | (_| | |_) | (_) | |_ "
    echo "|_____/ \___/|_|\__,_|_| |_|\__,_|    |_____/|_| |_|_| .__/|_|_| |_|\__, |____/ \___/ \__|"
    echo "                                                      | |             __/ |               "
    echo "                                                      |_|            |___/                "
    echo -e "${NC}"
}

# Display usage information
function show_usage() {
    echo -e "${GREEN}Solana Memecoin Sniping Bot${NC}"
    echo -e "${BLUE}Usage:${NC} ./run.sh [OPTIONS] COMMAND"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  --dev, -d             Run in development mode"
    echo "  --prod, -p            Run in production mode (default)"
    echo "  --service=NAME, -s    Specify a service name"
    echo "  --logs, -l            Show logs after starting"
    echo "  --help, -h            Show this help message"
    echo ""
    echo -e "${BLUE}Commands:${NC}"
    echo "  start                 Start the services (default)"
    echo "  stop                  Stop the services"
    echo "  restart               Restart the services"
    echo "  logs                  Show logs"
    echo "  status                Show service status"
    echo "  build                 Build the services"
    echo "  clean                 Remove all containers, networks, and volumes"
    echo "  shell                 Open a shell in a service container (requires --service)"
    echo "  stats                 Show container resource usage"
    echo "  update                Pull latest changes and rebuild"
    echo "  export                Export logs and configuration"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  ./run.sh start                # Start all services in production mode"
    echo "  ./run.sh --dev start          # Start all services in development mode"
    echo "  ./run.sh --service=api-server shell  # Open a shell in the API server"
    echo "  ./run.sh logs                 # Show logs for all services"
    echo "  ./run.sh --service=lp-monitor logs  # Show logs for LP monitor only"
}

# Check if Docker is running
function check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker is not running${NC}"
        echo -e "${YELLOW}Please start Docker and try again${NC}"
        exit 1
    fi
}

# Check if .env file exists
function check_env() {
    if [ ! -f .env ]; then
        echo -e "${RED}Error: .env file not found${NC}"
        echo -e "${YELLOW}Please create a .env file by copying .env.example and configuring your settings${NC}"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dev|-d)
            MODE="dev"
            shift
            ;;
        --prod|-p)
            MODE="prod"
            shift
            ;;
        --service=*)
            SERVICE="${1#*=}"
            shift
            ;;
        -s)
            if [[ -z "$2" || "$2" == -* ]]; then
                echo -e "${RED}Error: --service requires a service name${NC}"
                exit 1
            fi
            SERVICE="$2"
            shift 2
            ;;
        --logs|-l)
            LOGS=true
            shift
            ;;
        --help|-h)
            show_banner
            show_usage
            exit 0
            ;;
        start|stop|restart|logs|status|build|clean|shell|stats|update|export)
            ACTION="$1"
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_usage
            exit 1
            ;;
    esac
done

# Set up Docker Compose command based on mode
if [ "$MODE" == "dev" ]; then
    DC="docker compose -f docker compose.yml -f docker compose.dev.yml"
else
    DC="docker compose"
fi

# Check if service exists for service-specific actions
function check_service() {
    if [ -n "$SERVICE" ]; then
        # Check if the service exists in docker compose.yml
        if ! $DC config --services | grep -q "^$SERVICE$"; then
            echo -e "${RED}Error: Service '$SERVICE' not found${NC}"
            echo -e "${YELLOW}Available services:${NC}"
            $DC config --services
            exit 1
        fi
    fi
}

# Execute the specified action
function execute_action() {
    case $ACTION in
        start)
            echo -e "${GREEN}Starting services in ${MODE} mode...${NC}"
            check_docker
            check_env
            
            if [ "$MODE" == "dev" ]; then
                echo -e "${YELLOW}Using development configuration${NC}"
            fi
            
            if [ -n "$SERVICE" ]; then
                check_service
                echo -e "${BLUE}Starting service: ${SERVICE}${NC}"
                $DC up -d "$SERVICE"
            else
                $DC up -d
            fi
            
            echo -e "${GREEN}Services started successfully!${NC}"
            
            if [ "$LOGS" = true ]; then
                if [ -n "$SERVICE" ]; then
                    $DC logs -f "$SERVICE"
                else
                    $DC logs -f
                fi
            fi
            ;;
            
        stop)
            echo -e "${GREEN}Stopping services...${NC}"
            check_docker
            
            if [ -n "$SERVICE" ]; then
                check_service
                echo -e "${BLUE}Stopping service: ${SERVICE}${NC}"
                $DC stop "$SERVICE"
            else
                $DC down
            fi
            
            echo -e "${GREEN}Services stopped successfully!${NC}"
            ;;
            
        restart)
            echo -e "${GREEN}Restarting services in ${MODE} mode...${NC}"
            check_docker
            check_env
            
            if [ -n "$SERVICE" ]; then
                check_service
                echo -e "${BLUE}Restarting service: ${SERVICE}${NC}"
                $DC restart "$SERVICE"
            else
                $DC down
                $DC up -d
            fi
            
            echo -e "${GREEN}Services restarted successfully!${NC}"
            
            if [ "$LOGS" = true ]; then
                if [ -n "$SERVICE" ]; then
                    $DC logs -f "$SERVICE"
                else
                    $DC logs -f
                fi
            fi
            ;;
            
        logs)
            echo -e "${GREEN}Showing logs...${NC}"
            check_docker
            
            if [ -n "$SERVICE" ]; then
                check_service
                $DC logs -f "$SERVICE"
            else
                $DC logs -f
            fi
            ;;
            
        status)
            echo -e "${GREEN}Service status:${NC}"
            check_docker
            $DC ps
            ;;
            
        build)
            echo -e "${GREEN}Building services...${NC}"
            check_docker
            
            if [ -n "$SERVICE" ]; then
                check_service
                echo -e "${BLUE}Building service: ${SERVICE}${NC}"
                $DC build "$SERVICE"
            else
                echo -e "${BLUE}Building base image...${NC}"
                docker compose build base-image
                echo -e "${BLUE}Building all services...${NC}"
                $DC build
            fi
            
            echo -e "${GREEN}Build completed successfully!${NC}"
            ;;
            
        clean)
            echo -e "${GREEN}Cleaning up containers, networks, and volumes...${NC}"
            check_docker
            
            if [ -n "$SERVICE" ]; then
                check_service
                echo -e "${RED}Cannot clean individual services. Cleaning everything...${NC}"
            fi
            
            $DC down -v --remove-orphans
            echo -e "${GREEN}Cleanup completed successfully!${NC}"
            ;;
            
        shell)
            echo -e "${GREEN}Opening shell...${NC}"
            check_docker
            
            if [ -z "$SERVICE" ]; then
                echo -e "${RED}Error: You must specify a service using --service${NC}"
                exit 1
            fi
            
            check_service
            echo -e "${BLUE}Opening shell in ${SERVICE}...${NC}"
            $DC exec "$SERVICE" /bin/sh
            ;;
            
        stats)
            echo -e "${GREEN}Container statistics:${NC}"
            check_docker
            
            if [ -n "$SERVICE" ]; then
                check_service
                docker stats $(docker compose ps -q "$SERVICE")
            else
                docker stats $(docker compose ps -q)
            fi
            ;;
            
        update)
            echo -e "${GREEN}Updating the application...${NC}"
            check_docker
            
            echo -e "${BLUE}Pulling latest changes...${NC}"
            git pull
            
            echo -e "${BLUE}Rebuilding services...${NC}"
            if [ -n "$SERVICE" ]; then
                check_service
                docker compose build base-image
                $DC build "$SERVICE"
                $DC up -d --no-deps "$SERVICE"
            else
                docker compose build base-image
                $DC build
                $DC up -d
            fi
            
            echo -e "${GREEN}Update completed successfully!${NC}"
            ;;
            
        export)
            echo -e "${GREEN}Exporting logs and configuration...${NC}"
            
            # Create export directory
            EXPORT_DIR="export_$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$EXPORT_DIR"
            
            # Export logs
            echo -e "${BLUE}Exporting logs...${NC}"
            mkdir -p "$EXPORT_DIR/logs"
            if [ -d "logs" ]; then
                cp -r logs/* "$EXPORT_DIR/logs/" 2>/dev/null || true
            fi
            
            # Export environment configuration (without sensitive data)
            echo -e "${BLUE}Exporting configuration...${NC}"
            if [ -f ".env" ]; then
                # Create sanitized version without sensitive data
                grep -v -E "SECRET|PASSWORD|KEY" .env > "$EXPORT_DIR/.env.sanitized"
            fi
            
            # Export container information
            echo -e "${BLUE}Exporting container information...${NC}"
            docker compose ps > "$EXPORT_DIR/containers.txt"
            docker compose config > "$EXPORT_DIR/compose-config.yml"
            
            # Create archive
            echo -e "${BLUE}Creating archive...${NC}"
            tar -czf "${EXPORT_DIR}.tar.gz" "$EXPORT_DIR"
            rm -rf "$EXPORT_DIR"
            
            echo -e "${GREEN}Export completed: ${EXPORT_DIR}.tar.gz${NC}"
            ;;
    esac
}

# Main execution
show_banner
execute_action