#!/bin/bash

# Post-deployment health check script for VonkFi
# This script performs comprehensive checks after deployment

set -e

# Configuration
ENVIRONMENT_URL=${1:-"http://localhost:3000"}
CHECK_TIMEOUT=30
MAX_RETRIES=5
SLEEP_BETWEEN_RETRIES=10

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
http_check() {
    local url=$1
    local expected_status=${2:-200}
    local description=$3
    
    log_info "Checking: $description"
    
    for i in $(seq 1 $MAX_RETRIES); do
        log_info "Attempt $i/$MAX_RETRIES: GET $url"
        
        response=$(curl -s -w "%{http_code}|%{time_total}" \
            --max-time $CHECK_TIMEOUT \
            "$url" 2>/dev/null || echo "000|0")
        
        http_code=$(echo "$response" | cut -d'|' -f1)
        response_time=$(echo "$response" | cut -d'|' -f2)
        
        if [ "$http_code" = "$expected_status" ]; then
            log_success "✅ $description - Status: $http_code, Time: ${response_time}s"
            return 0
        else
            log_warning "❌ $description - Expected: $expected_status, Got: $http_code"
            if [ $i -lt $MAX_RETRIES ]; then
                log_info "Retrying in $SLEEP_BETWEEN_RETRIES seconds..."
                sleep $SLEEP_BETWEEN_RETRIES
            fi
        fi
    done
    
    log_error "Failed after $MAX_RETRIES attempts: $description"
    return 1
}

# Function to check application health
check_application_health() {
    log_info "🏥 Checking application health..."
    
    if http_check "$ENVIRONMENT_URL/api/health" 200 "Health endpoint"; then
        # Parse health response for additional info
        health_response=$(curl -s "$ENVIRONMENT_URL/api/health" 2>/dev/null || echo '{}')
        
        if command -v jq >/dev/null 2>&1; then
            status=$(echo "$health_response" | jq -r '.status // "unknown"')
            version=$(echo "$health_response" | jq -r '.version // "unknown"')
            environment=$(echo "$health_response" | jq -r '.environment // "unknown"')
            
            log_success "Application Status: $status"
            log_success "Version: $version"
            log_success "Environment: $environment"
        fi
        
        return 0
    else
        return 1
    fi
}

# Function to check critical API endpoints
check_api_endpoints() {
    log_info "🔌 Checking critical API endpoints..."
    
    local endpoints=(
        "/api/health:200:Health check"
        "/api/categories:200:Categories API"
    )
    
    local failed_checks=0
    
    for endpoint_config in "${endpoints[@]}"; do
        IFS=':' read -r endpoint expected_status description <<< "$endpoint_config"
        
        if ! http_check "$ENVIRONMENT_URL$endpoint" "$expected_status" "$description"; then
            ((failed_checks++))
        fi
    done
    
    if [ $failed_checks -eq 0 ]; then
        log_success "All API endpoints are responding correctly"
        return 0
    else
        log_error "$failed_checks API endpoint(s) failed"
        return 1
    fi
}

# Function to check database connectivity
check_database_connectivity() {
    log_info "🗄️  Checking database connectivity..."
    
    # Check database connectivity through API
    if http_check "$ENVIRONMENT_URL/api/categories" 200 "Database connectivity (via categories API)"; then
        log_success "Database appears to be accessible"
        return 0
    else
        log_error "Database connectivity issues detected"
        return 1
    fi
}

# Function to check frontend accessibility
check_frontend() {
    log_info "🌐 Checking frontend accessibility..."
    
    if http_check "$ENVIRONMENT_URL" 200 "Frontend application"; then
        # Check if the response contains expected content
        response=$(curl -s "$ENVIRONMENT_URL" 2>/dev/null || echo "")
        
        if echo "$response" | grep -q "VonkFi\|<!DOCTYPE html\|<html"; then
            log_success "Frontend is serving content correctly"
            return 0
        else
            log_warning "Frontend is responding but content may be incorrect"
            return 1
        fi
    else
        return 1
    fi
}

# Function to check static assets
check_static_assets() {
    log_info "📦 Checking static assets..."
    
    # Try to access common static assets
    local asset_checks=0
    local asset_failures=0
    
    # Check for CSS
    if curl -s --head "$ENVIRONMENT_URL/assets/index.css" | grep -q "200 OK"; then
        log_success "CSS assets are accessible"
        ((asset_checks++))
    else
        log_warning "CSS assets may not be accessible"
        ((asset_failures++))
    fi
    
    # Check for favicon
    if curl -s --head "$ENVIRONMENT_URL/favicon.ico" | grep -q "200\|404"; then
        ((asset_checks++))
    else
        ((asset_failures++))
    fi
    
    if [ $asset_failures -eq 0 ]; then
        log_success "Static assets are accessible"
        return 0
    else
        log_warning "Some static assets may have issues"
        return 1
    fi
}

# Function to performance check
check_performance() {
    log_info "⚡ Checking application performance..."
    
    local start_time=$(date +%s%N)
    
    if curl -s --max-time 5 "$ENVIRONMENT_URL/api/health" >/dev/null; then
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ $response_time -lt 1000 ]; then
            log_success "Performance check passed: ${response_time}ms"
            return 0
        elif [ $response_time -lt 3000 ]; then
            log_warning "Performance slower than expected: ${response_time}ms"
            return 0
        else
            log_error "Performance issue detected: ${response_time}ms"
            return 1
        fi
    else
        log_error "Performance check failed - endpoint not responding"
        return 1
    fi
}

# Function to check security headers
check_security_headers() {
    log_info "🔒 Checking security headers..."
    
    headers=$(curl -s -I "$ENVIRONMENT_URL/api/health" 2>/dev/null || echo "")
    
    local security_score=0
    local max_score=4
    
    # Check for important security headers
    if echo "$headers" | grep -qi "x-content-type-options"; then
        log_success "X-Content-Type-Options header present"
        ((security_score++))
    else
        log_warning "X-Content-Type-Options header missing"
    fi
    
    if echo "$headers" | grep -qi "x-frame-options"; then
        log_success "X-Frame-Options header present"
        ((security_score++))
    else
        log_warning "X-Frame-Options header missing"
    fi
    
    if echo "$headers" | grep -qi "x-xss-protection"; then
        log_success "X-XSS-Protection header present"
        ((security_score++))
    else
        log_warning "X-XSS-Protection header missing"
    fi
    
    if echo "$headers" | grep -qi "content-security-policy"; then
        log_success "Content-Security-Policy header present"
        ((security_score++))
    else
        log_warning "Content-Security-Policy header missing"
    fi
    
    if [ $security_score -ge $((max_score / 2)) ]; then
        log_success "Security headers check passed ($security_score/$max_score)"
        return 0
    else
        log_warning "Security headers need attention ($security_score/$max_score)"
        return 1
    fi
}

# Function to check SSL/TLS (if HTTPS)
check_ssl() {
    if [[ $ENVIRONMENT_URL == https://* ]]; then
        log_info "🔐 Checking SSL/TLS configuration..."
        
        local domain=$(echo "$ENVIRONMENT_URL" | sed 's|https://||' | cut -d'/' -f1)
        
        if echo | openssl s_client -connect "$domain:443" -servername "$domain" 2>/dev/null | grep -q "Verify return code: 0"; then
            log_success "SSL certificate is valid"
            return 0
        else
            log_error "SSL certificate issues detected"
            return 1
        fi
    else
        log_info "🔐 Skipping SSL check (HTTP environment)"
        return 0
    fi
}

# Function to check logs for errors
check_for_errors() {
    log_info "📋 Checking for critical errors..."
    
    # This would typically check application logs
    # For now, we'll just verify the application is not returning 5xx errors
    local error_endpoints=("/" "/api/health" "/api/categories")
    local server_errors=0
    
    for endpoint in "${error_endpoints[@]}"; do
        status_code=$(curl -s -o /dev/null -w "%{http_code}" "$ENVIRONMENT_URL$endpoint" || echo "000")
        
        if [[ $status_code == 5* ]]; then
            log_error "Server error detected on $endpoint: $status_code"
            ((server_errors++))
        fi
    done
    
    if [ $server_errors -eq 0 ]; then
        log_success "No server errors detected"
        return 0
    else
        log_error "$server_errors server error(s) found"
        return 1
    fi
}

# Function to generate deployment report
generate_report() {
    local overall_status=$1
    local timestamp=$(date)
    
    cat > deployment-health-report.md << EOF
# Post-Deployment Health Check Report

**Environment:** $ENVIRONMENT_URL
**Timestamp:** $timestamp
**Overall Status:** $overall_status

## Check Results

| Check | Status | Notes |
|-------|--------|-------|
| Application Health | $health_status | Health endpoint responding |
| API Endpoints | $api_status | Critical APIs accessible |
| Database Connectivity | $db_status | Database accessible via API |
| Frontend | $frontend_status | Frontend serving content |
| Static Assets | $assets_status | Assets loading correctly |
| Performance | $performance_status | Response times acceptable |
| Security Headers | $security_status | Security headers present |
| SSL/TLS | $ssl_status | Certificate valid |
| Error Check | $error_status | No server errors detected |

## Recommendations

EOF

    if [ "$overall_status" = "PASSED" ]; then
        echo "- ✅ Deployment appears healthy and ready for traffic" >> deployment-health-report.md
        echo "- Monitor application logs for any issues" >> deployment-health-report.md
        echo "- Schedule regular health checks" >> deployment-health-report.md
    else
        echo "- ❌ Address failing health checks before directing traffic" >> deployment-health-report.md
        echo "- Review application logs for errors" >> deployment-health-report.md
        echo "- Consider rollback if issues persist" >> deployment-health-report.md
    fi

    echo "" >> deployment-health-report.md
    echo "## Next Steps" >> deployment-health-report.md
    echo "- Monitor application metrics" >> deployment-health-report.md
    echo "- Verify user-facing functionality" >> deployment-health-report.md
    echo "- Update monitoring dashboards" >> deployment-health-report.md
}

# Main execution
main() {
    echo "=================================================="
    log_info "🚀 Starting Post-Deployment Health Check"
    log_info "Environment: $ENVIRONMENT_URL"
    log_info "Timeout: ${CHECK_TIMEOUT}s per check"
    log_info "Max retries: $MAX_RETRIES"
    echo "=================================================="
    
    local failed_checks=0
    local total_checks=0
    
    # Run all health checks
    checks=(
        "check_application_health:health_status"
        "check_api_endpoints:api_status"
        "check_database_connectivity:db_status"
        "check_frontend:frontend_status"
        "check_static_assets:assets_status"
        "check_performance:performance_status"
        "check_security_headers:security_status"
        "check_ssl:ssl_status"
        "check_for_errors:error_status"
    )
    
    for check_config in "${checks[@]}"; do
        IFS=':' read -r check_function status_var <<< "$check_config"
        ((total_checks++))
        
        echo ""
        if $check_function; then
            declare "$status_var=✅ PASS"
        else
            declare "$status_var=❌ FAIL"
            ((failed_checks++))
        fi
    done
    
    # Generate summary
    echo ""
    echo "=================================================="
    log_info "🏁 Health Check Summary"
    echo "=================================================="
    
    if [ $failed_checks -eq 0 ]; then
        log_success "🎉 All health checks passed! ($total_checks/$total_checks)"
        log_success "Deployment appears to be healthy and ready for traffic"
        generate_report "PASSED"
        exit 0
    else
        log_error "❌ $failed_checks out of $total_checks health checks failed"
        log_error "Deployment may have issues that need attention"
        generate_report "FAILED"
        exit 1
    fi
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [environment_url]"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Check localhost:3000"
    echo "  $0 https://staging.vonkfi.com        # Check staging"
    echo "  $0 https://vonkfi.com                # Check production"
    echo ""
    echo "Environment variables:"
    echo "  CHECK_TIMEOUT=30       # Request timeout in seconds"
    echo "  MAX_RETRIES=5          # Number of retries for failed checks"
    echo "  SLEEP_BETWEEN_RETRIES=10  # Delay between retries in seconds"
    exit 0
fi

# Run the main function
main