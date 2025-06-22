#!/bin/bash

# VonkFi Application Startup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        print_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
    print_success "Docker Compose is available"
}

# Function to setup environment file
setup_environment() {
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating from template..."
        cp .env.example .env
        print_warning "⚠️  IMPORTANT: Please edit .env file with your secure passwords before continuing!"
        print_warning "   - Change POSTGRES_PASSWORD"
        print_warning "   - Change SESSION_SECRET (minimum 32 characters)"
        print_warning "   - Change JWT_SECRET"
        read -p "Press Enter to continue after editing .env file..."
    else
        print_success ".env file exists"
    fi
}

# Function to create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    mkdir -p uploads logs nginx/ssl
    print_success "Directories created"
}

# Function to build and start services
start_services() {
    local mode=$1
    
    print_status "Starting VonkFi application in ${mode} mode..."
    
    if [ "$mode" = "development" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
        print_success "Development services started!"
        echo ""
        print_status "Service URLs:"
        echo "  🌐 Application: http://localhost:3001"
        echo "  🗄️  Database Admin: http://localhost:8080 (admin@vonkfi.dev / admin)"
        echo "  📊 Redis Admin: http://localhost:8081"
        echo ""
    else
        docker-compose up --build -d
        print_success "Production services started!"
        echo ""
        print_status "Service URLs:"
        echo "  🌐 Application: http://localhost:3000"
        echo "  ⚡ Health Check: http://localhost:3000/api/health"
        echo ""
    fi
}

# Function to show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    echo ""
    
    print_status "Health Checks:"
    echo "  🔍 Checking application health..."
    sleep 5  # Give services time to start
    
    if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        print_success "Application is healthy ✅"
    else
        print_warning "Application health check failed (may still be starting)"
    fi
}

# Function to show logs
show_logs() {
    local mode=$1
    
    print_status "Showing application logs (Ctrl+C to exit)..."
    echo ""
    
    if [ "$mode" = "development" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f vonkfi-app-dev
    else
        docker-compose logs -f vonkfi-app
    fi
}

# Main script
main() {
    echo ""
    echo "🔥 VonkFi Application Startup 🔥"
    echo "================================"
    echo ""
    
    # Parse command line arguments
    MODE="production"
    SHOW_LOGS=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dev|--development)
                MODE="development"
                shift
                ;;
            -l|--logs)
                SHOW_LOGS=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  -d, --dev          Start in development mode"
                echo "  -l, --logs         Show logs after startup"
                echo "  -h, --help         Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                 Start in production mode"
                echo "  $0 --dev           Start in development mode"
                echo "  $0 --dev --logs    Start in development mode and show logs"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Perform checks and setup
    check_docker
    check_docker_compose
    setup_environment
    create_directories
    
    # Start services
    start_services "$MODE"
    
    # Show status
    show_status
    
    # Show logs if requested
    if [ "$SHOW_LOGS" = true ]; then
        show_logs "$MODE"
    else
        print_status "To view logs, run:"
        if [ "$MODE" = "development" ]; then
            echo "  docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f vonkfi-app-dev"
        else
            echo "  docker-compose logs -f vonkfi-app"
        fi
        echo ""
        print_status "To stop services, run:"
        echo "  docker-compose down"
        echo ""
        print_success "VonkFi is ready! 🎉"
    fi
}

# Run main function
main "$@"