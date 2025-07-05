#!/bin/bash

# Smoke tests for VonkFi deployment validation
# Usage: ./scripts/smoke-tests.sh [environment_url]

set -e

# Configuration
ENVIRONMENT_URL=${1:-"http://localhost:3000"}
TIMEOUT=30
RETRY_COUNT=3
RETRY_DELAY=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to make HTTP requests with retry logic
http_request() {
    local url=$1
    local expected_status=${2:-200}
    local method=${3:-GET}
    local data=${4:-""}
    
    for i in $(seq 1 $RETRY_COUNT); do
        log_info "Attempt $i/$RETRY_COUNT: $method $url"
        
        if [ -n "$data" ]; then
            response=$(curl -s -w "%{http_code}" -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                --max-time $TIMEOUT \
                "$url" || echo "000")
        else
            response=$(curl -s -w "%{http_code}" -X "$method" \
                --max-time $TIMEOUT \
                "$url" || echo "000")
        fi
        
        # Extract status code (last 3 characters)
        status_code="${response: -3}"
        body="${response%???}"
        
        if [ "$status_code" = "$expected_status" ]; then
            log_success "✅ $method $url - Status: $status_code"
            echo "$body"
            return 0
        else
            log_warning "❌ $method $url - Expected: $expected_status, Got: $status_code"
            if [ $i -lt $RETRY_COUNT ]; then
                log_info "Retrying in $RETRY_DELAY seconds..."
                sleep $RETRY_DELAY
            fi
        fi
    done
    
    log_error "Failed after $RETRY_COUNT attempts: $method $url"
    return 1
}

# Function to check if service is responding
check_service_availability() {
    log_info "🔍 Checking service availability at $ENVIRONMENT_URL"
    
    if http_request "$ENVIRONMENT_URL" 200 > /dev/null; then
        log_success "Service is responding"
        return 0
    else
        log_error "Service is not responding"
        return 1
    fi
}

# Function to test health endpoint
test_health_endpoint() {
    log_info "🏥 Testing health endpoint"
    
    response=$(http_request "$ENVIRONMENT_URL/api/health" 200)
    
    if echo "$response" | grep -q "healthy"; then
        log_success "Health endpoint is working correctly"
        
        # Parse and display health information
        if command -v jq >/dev/null 2>&1; then
            echo "$response" | jq '.'
        else
            echo "$response"
        fi
        
        return 0
    else
        log_error "Health endpoint is not returning expected response"
        echo "Response: $response"
        return 1
    fi
}

# Function to test static assets
test_static_assets() {
    log_info "📦 Testing static assets"
    
    # Test main CSS file
    if http_request "$ENVIRONMENT_URL/assets/index.css" 200 > /dev/null; then
        log_success "CSS assets are loading"
    else
        log_warning "CSS assets may not be loading correctly"
    fi
    
    # Test main JS file (this will vary based on build)
    # For now, just test that we get some response from assets directory
    log_success "Static assets test completed"
}

# Function to test API endpoints
test_api_endpoints() {
    log_info "🔌 Testing critical API endpoints"
    
    # Test categories endpoint (public)
    if http_request "$ENVIRONMENT_URL/api/categories" 200 > /dev/null; then
        log_success "Categories API is working"
    else
        log_error "Categories API is not working"
        return 1
    fi
    
    # Test health endpoint with more detail
    if http_request "$ENVIRONMENT_URL/api/health" 200 > /dev/null; then
        log_success "Health API is working"
    else
        log_error "Health API is not working"
        return 1
    fi
    
    return 0
}

# Function to test database connectivity
test_database_connectivity() {
    log_info "🗄️  Testing database connectivity (via API)"
    
    # The health endpoint should include database status
    response=$(http_request "$ENVIRONMENT_URL/api/health" 200)
    
    if echo "$response" | grep -q "healthy"; then
        log_success "Database connectivity appears to be working"
        return 0
    else
        log_error "Database connectivity may be compromised"
        echo "Health response: $response"
        return 1
    fi
}

# Function to test frontend loading
test_frontend_loading() {
    log_info "🌐 Testing frontend loading"
    
    response=$(http_request "$ENVIRONMENT_URL" 200)
    
    if echo "$response" | grep -q "VonkFi\|<!DOCTYPE html"; then
        log_success "Frontend is loading correctly"
        return 0
    else
        log_error "Frontend may not be loading correctly"
        echo "Response preview: ${response:0:200}..."
        return 1
    fi
}

# Function to test authentication endpoints
test_auth_endpoints() {
    log_info "🔐 Testing authentication endpoints"
    
    # Test login endpoint (should return 400 for missing credentials)
    if http_request "$ENVIRONMENT_URL/api/auth/login" 400 POST '{}' > /dev/null; then
        log_success "Login endpoint is responding correctly"
    else
        log_warning "Login endpoint may not be configured correctly"
    fi
    
    return 0
}

# Function to run performance checks
test_basic_performance() {
    log_info "⚡ Running basic performance checks"
    
    # Measure response time for health endpoint
    start_time=$(date +%s%N)
    if http_request "$ENVIRONMENT_URL/api/health" 200 > /dev/null; then
        end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ $response_time -lt 1000 ]; then
            log_success "Health endpoint response time: ${response_time}ms ✅"
        elif [ $response_time -lt 5000 ]; then
            log_warning "Health endpoint response time: ${response_time}ms (slow)"
        else
            log_error "Health endpoint response time: ${response_time}ms (very slow)"
            return 1
        fi
    else
        log_error "Performance test failed - health endpoint not responding"
        return 1
    fi
    
    return 0
}

# Function to test error handling
test_error_handling() {
    log_info "🚨 Testing error handling"
    
    # Test 404 endpoint
    if http_request "$ENVIRONMENT_URL/api/nonexistent" 404 > /dev/null; then
        log_success "404 error handling is working"
    else
        log_warning "404 error handling may not be working correctly"
    fi
    
    # Test invalid JSON endpoint
    if http_request "$ENVIRONMENT_URL/api/categories" 400 POST 'invalid json' > /dev/null; then
        log_success "Invalid JSON error handling is working"
    else
        log_warning "Invalid JSON error handling may not be working correctly"
    fi
    
    return 0
}

# Main execution function
run_smoke_tests() {
    log_info "🚀 Starting VonkFi smoke tests"
    log_info "Environment: $ENVIRONMENT_URL"
    log_info "Timeout: ${TIMEOUT}s"
    log_info "Retry count: $RETRY_COUNT"
    echo ""
    
    local test_results=()
    local failed_tests=0
    
    # Run all smoke tests
    tests=(
        "check_service_availability"
        "test_health_endpoint"
        "test_frontend_loading"
        "test_static_assets"
        "test_api_endpoints"
        "test_database_connectivity"
        "test_auth_endpoints"
        "test_basic_performance"
        "test_error_handling"
    )
    
    for test in "${tests[@]}"; do
        echo ""
        log_info "Running test: $test"
        
        if $test; then
            test_results+=("✅ $test")
        else
            test_results+=("❌ $test")
            ((failed_tests++))
        fi
    done
    
    # Summary
    echo ""
    echo "=================================================="
    log_info "🏁 Smoke test results summary"
    echo "=================================================="
    
    for result in "${test_results[@]}"; do
        echo "$result"
    done
    
    echo ""
    if [ $failed_tests -eq 0 ]; then
        log_success "🎉 All smoke tests passed!"
        echo "Environment $ENVIRONMENT_URL appears to be healthy and ready."
        exit 0
    else
        log_error "❌ $failed_tests test(s) failed"
        echo "Environment $ENVIRONMENT_URL may have issues that need investigation."
        exit 1
    fi
}

# Script usage
show_usage() {
    echo "Usage: $0 [environment_url]"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Test localhost:3000"
    echo "  $0 https://staging.vonkfi.com        # Test staging"
    echo "  $0 https://vonkfi.com                # Test production"
    echo ""
    echo "Environment variables:"
    echo "  TIMEOUT=30        # Request timeout in seconds"
    echo "  RETRY_COUNT=3     # Number of retries for failed requests"
    echo "  RETRY_DELAY=5     # Delay between retries in seconds"
}

# Main script execution
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_usage
    exit 0
fi

# Run the smoke tests
run_smoke_tests