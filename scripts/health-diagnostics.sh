#!/bin/bash

# VonkFi Test Infrastructure Health Diagnostics
# Automated health checking and diagnostics script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
HEALTH_DIR="./logs/health-diagnostics"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$HEALTH_DIR/health-report-$TIMESTAMP.json"
LOG_FILE="$HEALTH_DIR/diagnostics-$TIMESTAMP.log"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_header() {
    echo -e "${PURPLE}[HEALTH]${NC} $1" | tee -a "$LOG_FILE"
}

# Initialize diagnostics
init_diagnostics() {
    log_header "🏥 Initializing health diagnostics..."
    
    # Create health directory
    mkdir -p "$HEALTH_DIR"
    
    # Initialize report
    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "diagnostics_version": "1.0.0",
  "environment": "${NODE_ENV:-development}",
  "system": {},
  "containers": {},
  "database": {},
  "network": {},
  "performance": {},
  "tests": {},
  "summary": {
    "overall_status": "unknown",
    "critical_issues": 0,
    "warnings": 0,
    "recommendations": []
  }
}
EOF
    
    log_success "Health diagnostics initialized"
}

# System diagnostics
check_system_health() {
    log_info "🖥️ Checking system health..."
    
    # System information
    local OS_TYPE=$(uname -s)
    local OS_VERSION=$(uname -r)
    local ARCHITECTURE=$(uname -m)
    local HOSTNAME=$(hostname)
    
    # Memory information
    if command -v free >/dev/null 2>&1; then
        local MEMORY_TOTAL=$(free -m | awk 'NR==2{print $2}')
        local MEMORY_USED=$(free -m | awk 'NR==2{print $3}')
        local MEMORY_FREE=$(free -m | awk 'NR==2{print $4}')
        local MEMORY_PERCENT=$(( MEMORY_USED * 100 / MEMORY_TOTAL ))
    else
        # macOS fallback
        local MEMORY_TOTAL=$(sysctl -n hw.memsize | awk '{print int($1/1024/1024)}')
        local MEMORY_USED="unknown"
        local MEMORY_FREE="unknown"
        local MEMORY_PERCENT="unknown"
    fi
    
    # Disk space
    local DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    local DISK_AVAILABLE=$(df -h . | awk 'NR==2 {print $4}')
    
    # Load average
    if command -v uptime >/dev/null 2>&1; then
        local LOAD_1MIN=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
        local LOAD_5MIN=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $2}' | sed 's/,//')
        local LOAD_15MIN=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $3}' | sed 's/,//')
    else
        local LOAD_1MIN="unknown"
        local LOAD_5MIN="unknown"
        local LOAD_15MIN="unknown"
    fi
    
    # CPU count
    local CPU_COUNT=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "unknown")
    
    log_info "OS: $OS_TYPE $OS_VERSION ($ARCHITECTURE)"
    log_info "Hostname: $HOSTNAME"
    log_info "CPU cores: $CPU_COUNT"
    log_info "Memory: ${MEMORY_USED}MB / ${MEMORY_TOTAL}MB (${MEMORY_PERCENT}%)"
    log_info "Disk usage: ${DISK_USAGE}% (${DISK_AVAILABLE} available)"
    log_info "Load average: ${LOAD_1MIN}, ${LOAD_5MIN}, ${LOAD_15MIN}"
    
    # Update report
    jq --arg os_type "$OS_TYPE" \
       --arg os_version "$OS_VERSION" \
       --arg arch "$ARCHITECTURE" \
       --arg hostname "$HOSTNAME" \
       --arg cpu_count "$CPU_COUNT" \
       --arg memory_total "$MEMORY_TOTAL" \
       --arg memory_used "$MEMORY_USED" \
       --arg memory_percent "$MEMORY_PERCENT" \
       --arg disk_usage "$DISK_USAGE" \
       --arg disk_available "$DISK_AVAILABLE" \
       --arg load_1min "$LOAD_1MIN" \
       '.system = {
          "os_type": $os_type,
          "os_version": $os_version,
          "architecture": $arch,
          "hostname": $hostname,
          "cpu_count": ($cpu_count | tonumber? // $cpu_count),
          "memory": {
            "total_mb": ($memory_total | tonumber? // $memory_total),
            "used_mb": ($memory_used | tonumber? // $memory_used),
            "usage_percent": ($memory_percent | tonumber? // $memory_percent)
          },
          "disk": {
            "usage_percent": ($disk_usage | tonumber? // $disk_usage),
            "available": $disk_available
          },
          "load_average": {
            "1min": ($load_1min | tonumber? // $load_1min),
            "5min": "unknown",
            "15min": "unknown"
          }
        }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
    
    # System health warnings
    if [[ "$MEMORY_PERCENT" =~ ^[0-9]+$ ]] && [ "$MEMORY_PERCENT" -gt 85 ]; then
        log_warning "High memory usage: ${MEMORY_PERCENT}%"
    fi
    
    if [[ "$DISK_USAGE" =~ ^[0-9]+$ ]] && [ "$DISK_USAGE" -gt 85 ]; then
        log_warning "High disk usage: ${DISK_USAGE}%"
    fi
    
    log_success "System health check completed"
}

# Container health diagnostics
check_container_health() {
    log_info "🐳 Checking container health..."
    
    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not installed or not in PATH"
        return 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running"
        return 1
    fi
    
    # Check docker-compose
    if ! command -v docker-compose >/dev/null 2>&1; then
        log_error "docker-compose is not installed or not in PATH"
        return 1
    fi
    
    log_success "Docker and docker-compose are available"
    
    # Check test containers
    if [ -f "docker-compose.test.yml" ]; then
        log_info "Checking test containers..."
        
        # Container status
        local CONTAINER_STATUS=$(docker-compose -f docker-compose.test.yml ps --format json 2>/dev/null || echo "[]")
        
        if [ "$CONTAINER_STATUS" = "[]" ]; then
            log_warning "No test containers running"
            CONTAINER_STATUS='[{"Service": "none", "State": "not_running", "Health": "unknown"}]'
        fi
        
        # Parse container information
        local CONTAINERS_RUNNING=0
        local CONTAINERS_HEALTHY=0
        local CONTAINERS_TOTAL=0
        
        if command -v jq >/dev/null 2>&1; then
            # Count containers using jq if available
            CONTAINERS_TOTAL=$(echo "$CONTAINER_STATUS" | jq '. | length')
            CONTAINERS_RUNNING=$(echo "$CONTAINER_STATUS" | jq '[.[] | select(.State == "running")] | length')
            CONTAINERS_HEALTHY=$(echo "$CONTAINER_STATUS" | jq '[.[] | select(.Health == "healthy")] | length')
        else
            # Fallback parsing without jq
            CONTAINERS_TOTAL=$(echo "$CONTAINER_STATUS" | grep -c '"Service"' || echo "0")
            CONTAINERS_RUNNING=$(echo "$CONTAINER_STATUS" | grep -c '"State": "running"' || echo "0")
            CONTAINERS_HEALTHY=$(echo "$CONTAINER_STATUS" | grep -c '"Health": "healthy"' || echo "0")
        fi
        
        log_info "Containers: ${CONTAINERS_RUNNING}/${CONTAINERS_TOTAL} running, ${CONTAINERS_HEALTHY} healthy"
        
        # Container details
        echo "$CONTAINER_STATUS" | jq -r '.[] | "  \(.Service): \(.State) (\(.Health // "unknown"))"' 2>/dev/null || {
            echo "$CONTAINER_STATUS" | grep -o '"Service": "[^"]*"' | sed 's/"Service": "//;s/"//' | while read service; do
                echo "  $service: unknown (parsing failed)"
            done
        }
        
        # Update report
        jq --argjson container_data "$CONTAINER_STATUS" \
           --arg total "$CONTAINERS_TOTAL" \
           --arg running "$CONTAINERS_RUNNING" \
           --arg healthy "$CONTAINERS_HEALTHY" \
           '.containers = {
              "total": ($total | tonumber),
              "running": ($running | tonumber),
              "healthy": ($healthy | tonumber),
              "containers": $container_data
            }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
        
        # Container warnings
        if [ "$CONTAINERS_RUNNING" -lt "$CONTAINERS_TOTAL" ]; then
            log_warning "Not all containers are running: ${CONTAINERS_RUNNING}/${CONTAINERS_TOTAL}"
        fi
        
        if [ "$CONTAINERS_HEALTHY" -lt "$CONTAINERS_RUNNING" ]; then
            log_warning "Not all running containers are healthy: ${CONTAINERS_HEALTHY}/${CONTAINERS_RUNNING}"
        fi
        
    else
        log_warning "docker-compose.test.yml not found"
    fi
    
    log_success "Container health check completed"
}

# Database connectivity diagnostics
check_database_health() {
    log_info "🗄️ Checking database health..."
    
    local DB_HOST="localhost"
    local DB_PORT="5434"
    local DB_NAME="vonkfi_test"
    local DB_USER="test"
    local DB_PASSWORD="test"
    
    # Check if database is accessible
    if command -v psql >/dev/null 2>&1; then
        log_info "Testing direct database connection..."
        
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 as test;" >/dev/null 2>&1; then
            log_success "Direct database connection successful"
            
            # Get database information
            local DB_VERSION=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
            local DB_SIZE=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null | xargs)
            local DB_CONNECTIONS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB_NAME';" 2>/dev/null | xargs)
            
            log_info "Database version: $DB_VERSION"
            log_info "Database size: $DB_SIZE"
            log_info "Active connections: $DB_CONNECTIONS"
            
            # Check for essential tables
            local TABLES_EXIST=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
                SELECT count(*) FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'accounts', 'transactions', 'categories');
            " 2>/dev/null | xargs)
            
            if [ "$TABLES_EXIST" = "4" ]; then
                log_success "All essential tables exist"
            else
                log_warning "Missing essential tables (found $TABLES_EXIST/4)"
            fi
            
            # Update report
            jq --arg version "$DB_VERSION" \
               --arg size "$DB_SIZE" \
               --arg connections "$DB_CONNECTIONS" \
               --arg tables "$TABLES_EXIST" \
               '.database = {
                  "status": "connected",
                  "version": $version,
                  "size": $size,
                  "active_connections": ($connections | tonumber? // $connections),
                  "essential_tables": ($tables | tonumber? // $tables),
                  "expected_tables": 4
                }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
            
        else
            log_error "Direct database connection failed"
            
            jq '.database = {
                  "status": "disconnected",
                  "error": "Connection failed"
                }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
        fi
    else
        log_warning "psql not available, cannot test direct database connection"
    fi
    
    # Check database through Docker
    if docker-compose -f docker-compose.test.yml ps postgres-test | grep -q "Up"; then
        log_info "Testing database through Docker..."
        
        if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
            log_success "Database is ready through Docker"
        else
            log_error "Database not ready through Docker"
        fi
        
        # Check container logs for errors
        local LOG_ERRORS=$(docker-compose -f docker-compose.test.yml logs postgres-test --tail=50 2>/dev/null | grep -i error | wc -l)
        if [ "$LOG_ERRORS" -gt 0 ]; then
            log_warning "Found $LOG_ERRORS error(s) in database logs"
        fi
    else
        log_warning "Database container is not running"
    fi
    
    log_success "Database health check completed"
}

# Network connectivity diagnostics
check_network_health() {
    log_info "🌐 Checking network health..."
    
    # Check port availability
    local PORTS_TO_CHECK="5434 6381"
    local PORTS_STATUS=()
    
    for port in $PORTS_TO_CHECK; do
        if command -v nc >/dev/null 2>&1; then
            if nc -z localhost "$port" 2>/dev/null; then
                log_success "Port $port is open"
                PORTS_STATUS+=("$port:open")
            else
                log_warning "Port $port is not accessible"
                PORTS_STATUS+=("$port:closed")
            fi
        elif command -v telnet >/dev/null 2>&1; then
            if timeout 3 telnet localhost "$port" >/dev/null 2>&1; then
                log_success "Port $port is open"
                PORTS_STATUS+=("$port:open")
            else
                log_warning "Port $port is not accessible"
                PORTS_STATUS+=("$port:closed")
            fi
        else
            log_warning "Cannot test port $port (nc/telnet not available)"
            PORTS_STATUS+=("$port:unknown")
        fi
    done
    
    # Check for port conflicts
    if command -v lsof >/dev/null 2>&1; then
        log_info "Checking for port conflicts..."
        for port in $PORTS_TO_CHECK; do
            local PROCESS=$(lsof -ti :$port 2>/dev/null || echo "")
            if [ -n "$PROCESS" ]; then
                local PROCESS_NAME=$(ps -p "$PROCESS" -o comm= 2>/dev/null || echo "unknown")
                log_info "Port $port used by process $PROCESS ($PROCESS_NAME)"
            fi
        done
    fi
    
    # DNS resolution test
    if command -v nslookup >/dev/null 2>&1; then
        if nslookup localhost >/dev/null 2>&1; then
            log_success "DNS resolution working"
        else
            log_warning "DNS resolution issues detected"
        fi
    fi
    
    # Update report
    local PORTS_JSON=$(printf '%s\n' "${PORTS_STATUS[@]}" | jq -R 'split(":") | {port: .[0], status: .[1]}' | jq -s '.')
    jq --argjson ports "$PORTS_JSON" \
       '.network = {
          "ports": $ports,
          "localhost_resolution": "tested"
        }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
    
    log_success "Network health check completed"
}

# Performance diagnostics
check_performance() {
    log_info "⚡ Checking performance metrics..."
    
    # Node.js version
    if command -v node >/dev/null 2>&1; then
        local NODE_VERSION=$(node --version)
        log_info "Node.js version: $NODE_VERSION"
    else
        log_warning "Node.js not available"
        local NODE_VERSION="not_available"
    fi
    
    # NPM version
    if command -v npm >/dev/null 2>&1; then
        local NPM_VERSION=$(npm --version)
        log_info "npm version: $NPM_VERSION"
    else
        log_warning "npm not available"
        local NPM_VERSION="not_available"
    fi
    
    # Package installation status
    if [ -d "node_modules" ]; then
        local NODE_MODULES_SIZE=$(du -sh node_modules 2>/dev/null | cut -f1)
        local PACKAGE_COUNT=$(find node_modules -maxdepth 1 -type d | wc -l)
        log_info "Node modules: $PACKAGE_COUNT packages, $NODE_MODULES_SIZE"
    else
        log_warning "node_modules directory not found"
        local NODE_MODULES_SIZE="0"
        local PACKAGE_COUNT="0"
    fi
    
    # Check for lock file
    if [ -f "package-lock.json" ]; then
        log_success "package-lock.json exists"
        local LOCK_FILE_STATUS="exists"
    else
        log_warning "package-lock.json missing"
        local LOCK_FILE_STATUS="missing"
    fi
    
    # Test script availability
    local TEST_SCRIPTS=()
    if [ -f "package.json" ] && command -v jq >/dev/null 2>&1; then
        TEST_SCRIPTS=($(jq -r '.scripts | keys[] | select(test("test"))' package.json 2>/dev/null))
        log_info "Available test scripts: ${TEST_SCRIPTS[*]}"
    fi
    
    # Build artifacts
    local BUILD_DIRS=("dist" "build" ".next")
    local BUILD_STATUS=()
    
    for dir in "${BUILD_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            local BUILD_SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1)
            BUILD_STATUS+=("$dir:$BUILD_SIZE")
            log_info "Build directory $dir: $BUILD_SIZE"
        else
            BUILD_STATUS+=("$dir:missing")
        fi
    done
    
    # Update report
    jq --arg node_version "$NODE_VERSION" \
       --arg npm_version "$NPM_VERSION" \
       --arg node_modules_size "$NODE_MODULES_SIZE" \
       --arg package_count "$PACKAGE_COUNT" \
       --arg lock_file_status "$LOCK_FILE_STATUS" \
       --argjson test_scripts "$(printf '%s\n' "${TEST_SCRIPTS[@]}" | jq -R . | jq -s '.')" \
       '.performance = {
          "node_version": $node_version,
          "npm_version": $npm_version,
          "node_modules": {
            "size": $node_modules_size,
            "package_count": ($package_count | tonumber? // $package_count)
          },
          "lock_file_status": $lock_file_status,
          "test_scripts": $test_scripts
        }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
    
    log_success "Performance check completed"
}

# Test infrastructure health
check_test_infrastructure() {
    log_info "🧪 Checking test infrastructure health..."
    
    # Check test files
    local TEST_DIRS=("test" "tests" "__tests__")
    local TEST_FILE_COUNT=0
    local TEST_DIRS_FOUND=()
    
    for dir in "${TEST_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            TEST_DIRS_FOUND+=("$dir")
            local DIR_TEST_COUNT=$(find "$dir" -name "*.test.*" -o -name "*.spec.*" | wc -l)
            TEST_FILE_COUNT=$((TEST_FILE_COUNT + DIR_TEST_COUNT))
            log_info "Test directory $dir: $DIR_TEST_COUNT test files"
        fi
    done
    
    if [ ${#TEST_DIRS_FOUND[@]} -eq 0 ]; then
        log_warning "No test directories found"
    else
        log_info "Total test files: $TEST_FILE_COUNT"
    fi
    
    # Check for test configuration files
    local CONFIG_FILES=("vitest.config.ts" "vitest.config.js" "jest.config.js" "playwright.config.ts")
    local CONFIG_STATUS=()
    
    for config in "${CONFIG_FILES[@]}"; do
        if [ -f "$config" ]; then
            CONFIG_STATUS+=("$config:exists")
            log_success "Test config found: $config"
        else
            CONFIG_STATUS+=("$config:missing")
        fi
    done
    
    # Check test result directories
    local RESULT_DIRS=("test-results" "coverage" "test-reports")
    local RESULT_STATUS=()
    
    for dir in "${RESULT_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            local RESULT_COUNT=$(find "$dir" -type f | wc -l)
            RESULT_STATUS+=("$dir:$RESULT_COUNT files")
            log_info "Result directory $dir: $RESULT_COUNT files"
        else
            RESULT_STATUS+=("$dir:missing")
        fi
    done
    
    # Check if smoke tests can run
    local SMOKE_TEST_STATUS="unknown"
    if [ -f "test/smoke-tests.ts" ]; then
        log_info "Smoke test file found"
        SMOKE_TEST_STATUS="available"
    else
        log_warning "Smoke test file not found"
        SMOKE_TEST_STATUS="missing"
    fi
    
    # Update report
    jq --arg test_file_count "$TEST_FILE_COUNT" \
       --argjson test_dirs "$(printf '%s\n' "${TEST_DIRS_FOUND[@]}" | jq -R . | jq -s '.')" \
       --argjson config_status "$(printf '%s\n' "${CONFIG_STATUS[@]}" | jq -R 'split(":") | {file: .[0], status: .[1]}' | jq -s '.')" \
       --arg smoke_test_status "$SMOKE_TEST_STATUS" \
       '.tests = {
          "test_file_count": ($test_file_count | tonumber),
          "test_directories": $test_dirs,
          "config_files": $config_status,
          "smoke_test_status": $smoke_test_status
        }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
    
    log_success "Test infrastructure check completed"
}

# Generate health score and recommendations
generate_health_summary() {
    log_info "📊 Generating health summary..."
    
    # Calculate health score
    local SCORE=100
    local CRITICAL_ISSUES=0
    local WARNINGS=0
    local RECOMMENDATIONS=()
    
    # Read current report data
    if command -v jq >/dev/null 2>&1; then
        # Memory usage check
        local MEMORY_PERCENT=$(jq -r '.system.memory.usage_percent // 0' "$REPORT_FILE")
        if [[ "$MEMORY_PERCENT" =~ ^[0-9]+$ ]] && [ "$MEMORY_PERCENT" -gt 90 ]; then
            SCORE=$((SCORE - 20))
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            RECOMMENDATIONS+=("Critical: Reduce memory usage (currently ${MEMORY_PERCENT}%)")
        elif [[ "$MEMORY_PERCENT" =~ ^[0-9]+$ ]] && [ "$MEMORY_PERCENT" -gt 80 ]; then
            SCORE=$((SCORE - 10))
            WARNINGS=$((WARNINGS + 1))
            RECOMMENDATIONS+=("Warning: High memory usage (${MEMORY_PERCENT}%)")
        fi
        
        # Disk usage check
        local DISK_PERCENT=$(jq -r '.system.disk.usage_percent // 0' "$REPORT_FILE")
        if [[ "$DISK_PERCENT" =~ ^[0-9]+$ ]] && [ "$DISK_PERCENT" -gt 90 ]; then
            SCORE=$((SCORE - 15))
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            RECOMMENDATIONS+=("Critical: Free up disk space (currently ${DISK_PERCENT}%)")
        elif [[ "$DISK_PERCENT" =~ ^[0-9]+$ ]] && [ "$DISK_PERCENT" -gt 85 ]; then
            SCORE=$((SCORE - 5))
            WARNINGS=$((WARNINGS + 1))
            RECOMMENDATIONS+=("Warning: High disk usage (${DISK_PERCENT}%)")
        fi
        
        # Container health check
        local CONTAINERS_RUNNING=$(jq -r '.containers.running // 0' "$REPORT_FILE")
        local CONTAINERS_TOTAL=$(jq -r '.containers.total // 0' "$REPORT_FILE")
        if [ "$CONTAINERS_TOTAL" -gt 0 ] && [ "$CONTAINERS_RUNNING" -lt "$CONTAINERS_TOTAL" ]; then
            SCORE=$((SCORE - 25))
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            RECOMMENDATIONS+=("Critical: Start missing containers (${CONTAINERS_RUNNING}/${CONTAINERS_TOTAL} running)")
        fi
        
        # Database check
        local DB_STATUS=$(jq -r '.database.status // "unknown"' "$REPORT_FILE")
        if [ "$DB_STATUS" = "disconnected" ]; then
            SCORE=$((SCORE - 30))
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            RECOMMENDATIONS+=("Critical: Fix database connection")
        fi
        
        # Test infrastructure check
        local TEST_FILE_COUNT=$(jq -r '.tests.test_file_count // 0' "$REPORT_FILE")
        if [ "$TEST_FILE_COUNT" -eq 0 ]; then
            SCORE=$((SCORE - 10))
            WARNINGS=$((WARNINGS + 1))
            RECOMMENDATIONS+=("Warning: No test files found")
        fi
    fi
    
    # Ensure score doesn't go below 0
    if [ "$SCORE" -lt 0 ]; then
        SCORE=0
    fi
    
    # Determine overall status
    local OVERALL_STATUS="healthy"
    if [ "$CRITICAL_ISSUES" -gt 0 ]; then
        OVERALL_STATUS="critical"
    elif [ "$SCORE" -lt 60 ]; then
        OVERALL_STATUS="unhealthy"
    elif [ "$SCORE" -lt 80 ]; then
        OVERALL_STATUS="degraded"
    fi
    
    log_info "Health score: $SCORE/100"
    log_info "Overall status: $OVERALL_STATUS"
    log_info "Critical issues: $CRITICAL_ISSUES"
    log_info "Warnings: $WARNINGS"
    
    # Update report with summary
    local RECOMMENDATIONS_JSON=$(printf '%s\n' "${RECOMMENDATIONS[@]}" | jq -R . | jq -s '.')
    jq --arg score "$SCORE" \
       --arg status "$OVERALL_STATUS" \
       --arg critical "$CRITICAL_ISSUES" \
       --arg warnings "$WARNINGS" \
       --argjson recommendations "$RECOMMENDATIONS_JSON" \
       '.summary = {
          "overall_status": $status,
          "health_score": ($score | tonumber),
          "critical_issues": ($critical | tonumber),
          "warnings": ($warnings | tonumber),
          "recommendations": $recommendations
        }' "$REPORT_FILE" > temp.json && mv temp.json "$REPORT_FILE"
    
    log_success "Health summary generated"
}

# Generate human-readable report
generate_readable_report() {
    log_info "📄 Generating readable report..."
    
    local READABLE_REPORT="$HEALTH_DIR/health-report-$TIMESTAMP.txt"
    
    cat > "$READABLE_REPORT" << EOF
🏥 VonkFi Test Infrastructure Health Report
Generated: $(date '+%Y-%m-%d %H:%M:%S')
==========================================

EOF
    
    # Add summary
    if command -v jq >/dev/null 2>&1; then
        local OVERALL_STATUS=$(jq -r '.summary.overall_status' "$REPORT_FILE")
        local HEALTH_SCORE=$(jq -r '.summary.health_score' "$REPORT_FILE")
        local CRITICAL_ISSUES=$(jq -r '.summary.critical_issues' "$REPORT_FILE")
        local WARNINGS=$(jq -r '.summary.warnings' "$REPORT_FILE")
        
        cat >> "$READABLE_REPORT" << EOF
📊 OVERALL HEALTH: $OVERALL_STATUS ($HEALTH_SCORE/100)
Critical Issues: $CRITICAL_ISSUES
Warnings: $WARNINGS

EOF
        
        # Add system information
        cat >> "$READABLE_REPORT" << EOF
🖥️ SYSTEM INFORMATION
$(jq -r '.system | to_entries[] | "  \(.key): \(.value)"' "$REPORT_FILE" 2>/dev/null)

EOF
        
        # Add container status
        cat >> "$READABLE_REPORT" << EOF
🐳 CONTAINER STATUS
$(jq -r '.containers | "  Total: \(.total), Running: \(.running), Healthy: \(.healthy)"' "$REPORT_FILE" 2>/dev/null)

EOF
        
        # Add database status
        cat >> "$READABLE_REPORT" << EOF
🗄️ DATABASE STATUS
$(jq -r '.database | to_entries[] | "  \(.key): \(.value)"' "$REPORT_FILE" 2>/dev/null)

EOF
        
        # Add recommendations
        local REC_COUNT=$(jq -r '.summary.recommendations | length' "$REPORT_FILE")
        if [ "$REC_COUNT" -gt 0 ]; then
            cat >> "$READABLE_REPORT" << EOF
💡 RECOMMENDATIONS
$(jq -r '.summary.recommendations[]' "$REPORT_FILE" | sed 's/^/  - /')

EOF
        fi
    fi
    
    cat >> "$READABLE_REPORT" << EOF
📁 Files Generated:
  - JSON Report: $REPORT_FILE
  - Log File: $LOG_FILE
  - This Report: $READABLE_REPORT

For detailed JSON data: cat $REPORT_FILE | jq '.'
==========================================
EOF
    
    log_success "Readable report generated: $READABLE_REPORT"
    
    # Display summary to console
    echo
    log_header "🏥 HEALTH DIAGNOSTICS SUMMARY"
    cat "$READABLE_REPORT"
}

# Cleanup old diagnostic files
cleanup_old_diagnostics() {
    log_info "🧹 Cleaning up old diagnostic files..."
    
    # Remove files older than 7 days
    find "$HEALTH_DIR" -name "health-report-*.json" -mtime +7 -delete 2>/dev/null || true
    find "$HEALTH_DIR" -name "diagnostics-*.log" -mtime +7 -delete 2>/dev/null || true
    find "$HEALTH_DIR" -name "health-report-*.txt" -mtime +7 -delete 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Quick health check mode
quick_health_check() {
    log_header "⚡ Quick Health Check"
    
    # Essential checks only
    local ISSUES=0
    
    # Docker check
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon not running"
        ISSUES=$((ISSUES + 1))
    else
        log_success "Docker daemon running"
    fi
    
    # Container check
    if docker-compose -f docker-compose.test.yml ps postgres-test | grep -q "Up"; then
        log_success "Database container running"
    else
        log_error "Database container not running"
        ISSUES=$((ISSUES + 1))
    fi
    
    # Database connectivity
    if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test >/dev/null 2>&1; then
        log_success "Database responding"
    else
        log_error "Database not responding"
        ISSUES=$((ISSUES + 1))
    fi
    
    # Memory check
    if command -v free >/dev/null 2>&1; then
        local MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
        if [ "$MEMORY_PERCENT" -gt 90 ]; then
            log_error "Critical memory usage: ${MEMORY_PERCENT}%"
            ISSUES=$((ISSUES + 1))
        else
            log_success "Memory usage OK: ${MEMORY_PERCENT}%"
        fi
    fi
    
    # Summary
    if [ "$ISSUES" -eq 0 ]; then
        log_success "✅ Quick health check passed - no critical issues"
        return 0
    else
        log_error "❌ Quick health check failed - $ISSUES critical issue(s)"
        return 1
    fi
}

# Main execution
main() {
    local mode=${1:-"full"}
    
    case "$mode" in
        "quick")
            quick_health_check
            ;;
        "system")
            init_diagnostics
            check_system_health
            generate_health_summary
            ;;
        "containers")
            init_diagnostics
            check_container_health
            generate_health_summary
            ;;
        "database")
            init_diagnostics
            check_database_health
            generate_health_summary
            ;;
        "network")
            init_diagnostics
            check_network_health
            generate_health_summary
            ;;
        "performance")
            init_diagnostics
            check_performance
            generate_health_summary
            ;;
        "tests")
            init_diagnostics
            check_test_infrastructure
            generate_health_summary
            ;;
        "cleanup")
            cleanup_old_diagnostics
            ;;
        "full"|*)
            init_diagnostics
            check_system_health
            check_container_health
            check_database_health
            check_network_health
            check_performance
            check_test_infrastructure
            generate_health_summary
            generate_readable_report
            cleanup_old_diagnostics
            ;;
    esac
    
    log_success "🎉 Health diagnostics completed"
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [mode]"
    echo ""
    echo "Modes:"
    echo "  quick       - Quick health check (essential checks only)"
    echo "  system      - System health only"
    echo "  containers  - Container health only"
    echo "  database    - Database health only"
    echo "  network     - Network health only"
    echo "  performance - Performance checks only"
    echo "  tests       - Test infrastructure only"
    echo "  cleanup     - Cleanup old diagnostic files"
    echo "  full        - Complete health diagnostics (default)"
    echo ""
    echo "Examples:"
    echo "  $0 quick              # Quick check before running tests"
    echo "  $0 database           # Debug database issues"
    echo "  $0 containers         # Check container status"
    echo "  $0                    # Full comprehensive check"
    echo ""
    echo "Output files are saved to: $HEALTH_DIR/"
    exit 0
fi

# Run the diagnostics
main "$@"