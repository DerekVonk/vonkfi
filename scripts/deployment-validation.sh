#!/bin/bash

# Comprehensive Deployment Validation Script
# Validates deployment readiness across multiple environments

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
DEPLOYMENT_ENV=${1:-"staging"}
VALIDATION_DIR="./deployment-validation"
REPORT_FILE="$VALIDATION_DIR/deployment-validation-report.json"
CHECKLIST_FILE="$VALIDATION_DIR/deployment-checklist.md"

# Global counters
TOTAL_VALIDATIONS=0
PASSED_VALIDATIONS=0
FAILED_VALIDATIONS=0
WARNING_VALIDATIONS=0
CRITICAL_FAILURES=0

# Validation results
declare -A VALIDATION_RESULTS

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$VALIDATION_DIR/deployment.log"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$VALIDATION_DIR/deployment.log"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$VALIDATION_DIR/deployment.log"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$VALIDATION_DIR/deployment.log"
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $1" | tee -a "$VALIDATION_DIR/deployment.log"
}

# Initialize deployment validation
init_deployment_validation() {
    log_info "🚀 Initializing deployment validation for environment: $DEPLOYMENT_ENV"
    
    # Create validation directory
    mkdir -p "$VALIDATION_DIR"
    
    # Initialize report file
    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "$DEPLOYMENT_ENV",
  "validation_version": "2.0",
  "pipeline": {
    "id": "${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}",
    "branch": "${CI_COMMIT_REF_NAME:-${GITHUB_REF_NAME:-unknown}}",
    "commit": "${CI_COMMIT_SHA:-${GITHUB_SHA:-unknown}}"
  },
  "validations": {},
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "critical_failures": 0,
    "deployment_ready": false
  }
}
EOF
    
    log_success "Deployment validation environment initialized"
}

# Helper function to record validation result
record_validation() {
    local check_name="$1"
    local status="$2"  # pass, fail, warn, critical
    local message="$3"
    local details="${4:-}"
    
    VALIDATION_RESULTS["$check_name"]="$status:$message"
    TOTAL_VALIDATIONS=$((TOTAL_VALIDATIONS + 1))
    
    case "$status" in
        "pass")
            PASSED_VALIDATIONS=$((PASSED_VALIDATIONS + 1))
            log_success "✅ $check_name: $message"
            ;;
        "fail")
            FAILED_VALIDATIONS=$((FAILED_VALIDATIONS + 1))
            log_error "❌ $check_name: $message"
            ;;
        "warn")
            WARNING_VALIDATIONS=$((WARNING_VALIDATIONS + 1))
            log_warning "⚠️ $check_name: $message"
            ;;
        "critical")
            CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
            FAILED_VALIDATIONS=$((FAILED_VALIDATIONS + 1))
            log_critical "🚨 $check_name: $message"
            ;;
    esac
    
    # Update report file
    jq --arg check "$check_name" \
       --arg status "$status" \
       --arg message "$message" \
       --arg details "$details" \
       '.validations[$check] = {
          "status": $status,
          "message": $message,
          "details": $details,
          "timestamp": now | strftime("%Y-%m-%dT%H:%M:%SZ")
        }' "$REPORT_FILE" > tmp.json && mv tmp.json "$REPORT_FILE"
}

# Validate application build
validate_build() {
    log_info "🏗️ Validating application build..."
    
    # Check if build artifacts exist
    if [ -d "dist" ] || [ -d "build" ]; then
        record_validation "build.artifacts" "pass" "Build artifacts found"
        
        # Check build size
        local build_size=$(du -sm dist build 2>/dev/null | awk '{sum += $1} END {print sum}' || echo "0")
        if [ "$build_size" -le 100 ]; then
            record_validation "build.size" "pass" "Build size acceptable (${build_size}MB)"
        elif [ "$build_size" -le 200 ]; then
            record_validation "build.size" "warn" "Build size large (${build_size}MB)"
        else
            record_validation "build.size" "fail" "Build size too large (${build_size}MB)"
        fi
        
        # Check for essential files
        local essential_files=("index.html" "index.js" "index.css")
        local missing_files=""
        
        for file in "${essential_files[@]}"; do
            if ! find dist build -name "$file" 2>/dev/null | head -1 | grep -q .; then
                missing_files="$missing_files $file"
            fi
        done
        
        if [ -z "$missing_files" ]; then
            record_validation "build.essential_files" "pass" "All essential build files present"
        else
            record_validation "build.essential_files" "warn" "Missing essential files:$missing_files"
        fi
    else
        record_validation "build.artifacts" "critical" "No build artifacts found - build may have failed"
    fi
    
    # Validate package.json production readiness
    if [ -f "package.json" ]; then
        # Check for start script
        if jq -e '.scripts.start' package.json > /dev/null; then
            record_validation "build.start_script" "pass" "Production start script configured"
        else
            record_validation "build.start_script" "fail" "No production start script found"
        fi
        
        # Check for engines specification
        if jq -e '.engines.node' package.json > /dev/null; then
            record_validation "build.node_version" "pass" "Node.js version specified"
        else
            record_validation "build.node_version" "warn" "Node.js version not specified"
        fi
    fi
}

# Validate environment configuration
validate_environment() {
    log_info "🌍 Validating environment configuration..."
    
    # Check environment files
    local env_files=(
        ".env.${DEPLOYMENT_ENV}.example"
        ".env.example"
        ".env.production.example"
    )
    
    local env_file_found=false
    for env_file in "${env_files[@]}"; do
        if [ -f "$env_file" ]; then
            env_file_found=true
            record_validation "env.example_file" "pass" "Environment example file found: $env_file"
            break
        fi
    done
    
    if [ "$env_file_found" = false ]; then
        record_validation "env.example_file" "fail" "No environment example files found"
    fi
    
    # Check for sensitive data not in environment files
    if [ -f ".env" ]; then
        record_validation "env.sensitive_data" "critical" ".env file found in repository - should be gitignored"
    else
        record_validation "env.sensitive_data" "pass" "No .env file in repository"
    fi
    
    # Check gitignore for environment files
    if [ -f ".gitignore" ]; then
        if grep -q "\.env$" .gitignore || grep -q "\.env\.local" .gitignore; then
            record_validation "env.gitignore" "pass" "Environment files properly gitignored"
        else
            record_validation "env.gitignore" "warn" "Environment files may not be properly gitignored"
        fi
    else
        record_validation "env.gitignore" "warn" "No .gitignore file found"
    fi
    
    # Validate environment-specific configuration
    case "$DEPLOYMENT_ENV" in
        "production")
            # Production-specific checks
            if grep -q "NODE_ENV.*production" .env.production.example 2>/dev/null; then
                record_validation "env.production_mode" "pass" "Production mode configured"
            else
                record_validation "env.production_mode" "warn" "Production mode not explicitly set"
            fi
            ;;
        "staging")
            # Staging-specific checks
            if [ -f ".env.staging.example" ]; then
                record_validation "env.staging_config" "pass" "Staging environment configuration found"
            else
                record_validation "env.staging_config" "warn" "No staging-specific environment configuration"
            fi
            ;;
    esac
}

# Validate database readiness
validate_database() {
    log_info "🗄️ Validating database configuration..."
    
    # Check for migrations
    if [ -d "migrations" ] && [ "$(ls -A migrations 2>/dev/null)" ]; then
        local migration_count=$(find migrations -name "*.sql" | wc -l)
        record_validation "database.migrations" "pass" "Database migrations found ($migration_count files)"
        
        # Check for recent migrations (potential issues)
        local recent_migrations=$(find migrations -name "*.sql" -newermt "24 hours ago" | wc -l)
        if [ "$recent_migrations" -gt 0 ]; then
            record_validation "database.recent_migrations" "warn" "$recent_migrations recent migrations - verify compatibility"
        else
            record_validation "database.recent_migrations" "pass" "No recent migrations"
        fi
        
        # Check for rollback capability
        if find migrations -name "*rollback*" | head -1 | grep -q .; then
            record_validation "database.rollback" "pass" "Migration rollback scripts found"
        else
            record_validation "database.rollback" "warn" "No migration rollback scripts found"
        fi
    else
        record_validation "database.migrations" "warn" "No database migrations found"
    fi
    
    # Check database configuration
    if [ -f "drizzle.config.ts" ] || [ -f "knexfile.js" ] || [ -f "typeorm.config.js" ]; then
        record_validation "database.config" "pass" "Database configuration file found"
    else
        record_validation "database.config" "warn" "No database configuration file found"
    fi
    
    # Check for database connection validation
    if grep -r "pool\|connection" server/ --include="*.ts" >/dev/null 2>&1; then
        record_validation "database.connection_handling" "pass" "Database connection handling implemented"
    else
        record_validation "database.connection_handling" "warn" "Database connection handling not evident"
    fi
    
    # Environment-specific database checks
    case "$DEPLOYMENT_ENV" in
        "production")
            # Production database security checks
            if grep -r "ssl.*true\|sslmode" . --include="*.ts" --include="*.js" >/dev/null 2>&1; then
                record_validation "database.ssl" "pass" "SSL configuration found for production"
            else
                record_validation "database.ssl" "warn" "SSL configuration not evident for production database"
            fi
            ;;
    esac
}

# Validate Docker configuration
validate_docker() {
    log_info "🐳 Validating Docker configuration..."
    
    # Check Dockerfile
    if [ -f "Dockerfile" ]; then
        record_validation "docker.dockerfile" "pass" "Dockerfile found"
        
        # Dockerfile security checks
        if grep -q "USER" Dockerfile; then
            record_validation "docker.user" "pass" "Non-root user configured in Dockerfile"
        else
            record_validation "docker.user" "warn" "No non-root user configured in Dockerfile"
        fi
        
        # Multi-stage build check
        if grep -q "FROM.*AS" Dockerfile; then
            record_validation "docker.multistage" "pass" "Multi-stage build configured"
        else
            record_validation "docker.multistage" "warn" "Single-stage build (consider multi-stage for production)"
        fi
        
        # Security best practices
        if grep -q "COPY.*\\.\\." Dockerfile; then
            record_validation "docker.copy_context" "warn" "Dockerfile copies entire context - consider .dockerignore"
        else
            record_validation "docker.copy_context" "pass" "Selective file copying in Dockerfile"
        fi
        
        # Health check
        if grep -q "HEALTHCHECK" Dockerfile; then
            record_validation "docker.healthcheck" "pass" "Health check configured in Dockerfile"
        else
            record_validation "docker.healthcheck" "warn" "No health check in Dockerfile"
        fi
    else
        record_validation "docker.dockerfile" "warn" "No Dockerfile found"
    fi
    
    # Check docker-compose files
    local compose_files=(
        "docker-compose.yml"
        "docker-compose.${DEPLOYMENT_ENV}.yml"
        "docker-compose.production.yml"
    )
    
    local compose_found=false
    for compose_file in "${compose_files[@]}"; do
        if [ -f "$compose_file" ]; then
            compose_found=true
            record_validation "docker.compose" "pass" "Docker Compose file found: $compose_file"
            
            # Validate compose file
            if command -v docker-compose >/dev/null 2>&1; then
                if docker-compose -f "$compose_file" config >/dev/null 2>&1; then
                    record_validation "docker.compose_valid" "pass" "Docker Compose file is valid"
                else
                    record_validation "docker.compose_valid" "fail" "Docker Compose file has syntax errors"
                fi
            fi
            break
        fi
    done
    
    if [ "$compose_found" = false ]; then
        record_validation "docker.compose" "warn" "No Docker Compose files found"
    fi
    
    # Check .dockerignore
    if [ -f ".dockerignore" ]; then
        record_validation "docker.dockerignore" "pass" ".dockerignore file found"
        
        # Check for common exclusions
        local important_exclusions=("node_modules" ".git" "*.log" "test")
        local missing_exclusions=""
        
        for exclusion in "${important_exclusions[@]}"; do
            if ! grep -q "$exclusion" .dockerignore; then
                missing_exclusions="$missing_exclusions $exclusion"
            fi
        done
        
        if [ -z "$missing_exclusions" ]; then
            record_validation "docker.dockerignore_complete" "pass" "Important exclusions present in .dockerignore"
        else
            record_validation "docker.dockerignore_complete" "warn" "Consider adding to .dockerignore:$missing_exclusions"
        fi
    else
        record_validation "docker.dockerignore" "warn" "No .dockerignore file found"
    fi
}

# Validate security configuration
validate_security() {
    log_info "🔒 Validating security configuration..."
    
    # Check for security dependencies
    if [ -f "package.json" ]; then
        # Security middleware
        if jq -e '.dependencies.helmet' package.json >/dev/null 2>&1; then
            record_validation "security.helmet" "pass" "Helmet security middleware configured"
        else
            record_validation "security.helmet" "warn" "Helmet security middleware not found"
        fi
        
        # Rate limiting
        if jq -e '.dependencies."express-rate-limit"' package.json >/dev/null 2>&1; then
            record_validation "security.rate_limiting" "pass" "Rate limiting dependency found"
        else
            record_validation "security.rate_limiting" "warn" "Rate limiting not configured"
        fi
        
        # Authentication
        if jq -e '.dependencies.jsonwebtoken or .dependencies.passport' package.json >/dev/null 2>&1; then
            record_validation "security.authentication" "pass" "Authentication library found"
        else
            record_validation "security.authentication" "warn" "No authentication library found"
        fi
    fi
    
    # Check server security implementation
    if [ -d "server" ]; then
        # HTTPS configuration
        if grep -r "https\|ssl" server/ --include="*.ts" >/dev/null 2>&1; then
            record_validation "security.https" "pass" "HTTPS configuration found"
        else
            record_validation "security.https" "warn" "HTTPS configuration not evident"
        fi
        
        # Input validation
        if grep -r "validate\|sanitize" server/ --include="*.ts" >/dev/null 2>&1; then
            record_validation "security.input_validation" "pass" "Input validation implementation found"
        else
            record_validation "security.input_validation" "warn" "Input validation not evident"
        fi
        
        # Error handling
        if grep -r "errorHandler\|error.*middleware" server/ --include="*.ts" >/dev/null 2>&1; then
            record_validation "security.error_handling" "pass" "Error handling middleware found"
        else
            record_validation "security.error_handling" "warn" "Error handling middleware not evident"
        fi
    fi
    
    # Check for security scan results
    if [ -f "security-reports/security-summary.md" ]; then
        # Check for critical vulnerabilities
        if grep -q "Critical.*0" security-reports/security-summary.md; then
            record_validation "security.vulnerabilities" "pass" "No critical vulnerabilities found"
        else
            record_validation "security.vulnerabilities" "critical" "Critical vulnerabilities detected - review security report"
        fi
    else
        record_validation "security.scan_results" "warn" "No security scan results found"
    fi
}

# Validate monitoring and logging
validate_monitoring() {
    log_info "📊 Validating monitoring and logging configuration..."
    
    # Health check endpoint
    if grep -r "health\|/api/health" server/ --include="*.ts" >/dev/null 2>&1; then
        record_validation "monitoring.health_check" "pass" "Health check endpoint implemented"
    else
        record_validation "monitoring.health_check" "fail" "No health check endpoint found"
    fi
    
    # Logging implementation
    if grep -r "console\\.log\\|logger\\|winston\\|bunyan" server/ --include="*.ts" >/dev/null 2>&1; then
        record_validation "monitoring.logging" "pass" "Logging implementation found"
    else
        record_validation "monitoring.logging" "warn" "Logging implementation not evident"
    fi
    
    # Metrics collection
    if grep -r "metrics\\|prometheus\\|grafana" . --include="*.ts" --include="*.js" --include="*.yml" >/dev/null 2>&1; then
        record_validation "monitoring.metrics" "pass" "Metrics collection configured"
    else
        record_validation "monitoring.metrics" "warn" "No metrics collection found"
    fi
    
    # Error tracking
    if grep -r "sentry\\|bugsnag\\|rollbar" . --include="*.ts" --include="*.js" --include="*.json" >/dev/null 2>&1; then
        record_validation "monitoring.error_tracking" "pass" "Error tracking service configured"
    else
        record_validation "monitoring.error_tracking" "warn" "No error tracking service found"
    fi
    
    # Environment-specific monitoring
    case "$DEPLOYMENT_ENV" in
        "production")
            # Production monitoring requirements
            if [ -f "nginx/nginx.conf" ] || grep -r "nginx" . --include="*.yml" >/dev/null 2>&1; then
                record_validation "monitoring.reverse_proxy" "pass" "Reverse proxy configuration found"
            else
                record_validation "monitoring.reverse_proxy" "warn" "No reverse proxy configuration found"
            fi
            ;;
    esac
}

# Validate backup and recovery
validate_backup_recovery() {
    log_info "💾 Validating backup and recovery procedures..."
    
    # Database backup scripts
    if find scripts -name "*backup*" 2>/dev/null | head -1 | grep -q .; then
        record_validation "backup.database_scripts" "pass" "Database backup scripts found"
    else
        record_validation "backup.database_scripts" "warn" "No database backup scripts found"
    fi
    
    # Rollback procedures
    if find scripts -name "*rollback*" 2>/dev/null | head -1 | grep -q .; then
        record_validation "backup.rollback_scripts" "pass" "Rollback scripts found"
    else
        record_validation "backup.rollback_scripts" "warn" "No rollback scripts found"
    fi
    
    # Disaster recovery documentation
    if [ -f "DISASTER_RECOVERY.md" ] || [ -f "docs/disaster-recovery.md" ]; then
        record_validation "backup.disaster_recovery_docs" "pass" "Disaster recovery documentation found"
    else
        record_validation "backup.disaster_recovery_docs" "warn" "No disaster recovery documentation found"
    fi
    
    # Environment-specific backup validation
    case "$DEPLOYMENT_ENV" in
        "production")
            # Production backup requirements
            if grep -r "backup.*schedule\|cron.*backup" . --include="*.yml" --include="*.sh" >/dev/null 2>&1; then
                record_validation "backup.scheduled_backups" "pass" "Scheduled backup configuration found"
            else
                record_validation "backup.scheduled_backups" "warn" "No scheduled backup configuration found"
            fi
            ;;
    esac
}

# Validate performance and scalability
validate_performance() {
    log_info "⚡ Validating performance and scalability configuration..."
    
    # Caching configuration
    if grep -r "cache\|redis\|memcached" server/ --include="*.ts" >/dev/null 2>&1; then
        record_validation "performance.caching" "pass" "Caching implementation found"
    else
        record_validation "performance.caching" "warn" "No caching implementation found"
    fi
    
    # Database connection pooling
    if grep -r "pool\|connection.*pool" server/ --include="*.ts" >/dev/null 2>&1; then
        record_validation "performance.connection_pooling" "pass" "Database connection pooling configured"
    else
        record_validation "performance.connection_pooling" "warn" "Database connection pooling not evident"
    fi
    
    # Static asset optimization
    if [ -d "dist" ] && find dist -name "*.gz" | head -1 | grep -q .; then
        record_validation "performance.compression" "pass" "Asset compression configured"
    else
        record_validation "performance.compression" "warn" "No asset compression found"
    fi
    
    # CDN configuration
    if grep -r "cdn\|cloudfront\|cloudflare" . --include="*.ts" --include="*.js" --include="*.yml" >/dev/null 2>&1; then
        record_validation "performance.cdn" "pass" "CDN configuration found"
    else
        record_validation "performance.cdn" "warn" "No CDN configuration found"
    fi
    
    # Load balancing (for production)
    if [ "$DEPLOYMENT_ENV" = "production" ]; then
        if grep -r "load.*balanc\|upstream\|cluster" . --include="*.conf" --include="*.yml" >/dev/null 2>&1; then
            record_validation "performance.load_balancing" "pass" "Load balancing configuration found"
        else
            record_validation "performance.load_balancing" "warn" "No load balancing configuration found"
        fi
    fi
}

# Generate deployment checklist
generate_deployment_checklist() {
    log_info "📋 Generating deployment checklist..."
    
    cat > "$CHECKLIST_FILE" << EOF
# Deployment Checklist for $DEPLOYMENT_ENV Environment

Generated: $(date)
Environment: $DEPLOYMENT_ENV
Pipeline: ${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}

## Pre-Deployment Validation

EOF
    
    # Add validation results to checklist
    for check_name in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$check_name]}"
        local status="${result%%:*}"
        local message="${result#*:}"
        
        case "$status" in
            "pass")
                echo "- [x] **$check_name**: $message" >> "$CHECKLIST_FILE"
                ;;
            "fail"|"critical")
                echo "- [ ] **$check_name**: $message ⚠️" >> "$CHECKLIST_FILE"
                ;;
            "warn")
                echo "- [?] **$check_name**: $message ⚠️" >> "$CHECKLIST_FILE"
                ;;
        esac
    done
    
    cat >> "$CHECKLIST_FILE" << EOF

## Deployment Steps

### 1. Pre-Deployment
- [ ] All critical validations passed
- [ ] Security scan completed with no critical issues
- [ ] Database migrations tested
- [ ] Backup procedures verified
- [ ] Rollback plan prepared

### 2. Deployment Execution
- [ ] Application deployed successfully
- [ ] Database migrations applied
- [ ] Health checks passing
- [ ] SSL certificates valid
- [ ] DNS configuration updated

### 3. Post-Deployment
- [ ] Smoke tests passed
- [ ] Performance metrics within normal range
- [ ] Error rates acceptable
- [ ] Monitoring alerts configured
- [ ] Team notified of deployment

## Emergency Contacts

- **DevOps Team**: devops@vonkfi.com
- **Security Team**: security@vonkfi.com
- **On-Call Engineer**: oncall@vonkfi.com

## Rollback Procedure

If deployment issues occur:

1. Stop new deployments
2. Execute rollback script: \`./scripts/rollback.sh\`
3. Verify health checks
4. Notify team of rollback
5. Investigate and document issues

## Environment-Specific Notes

EOF
    
    case "$DEPLOYMENT_ENV" in
        "production")
            cat >> "$CHECKLIST_FILE" << EOF
### Production Deployment
- [ ] Maintenance window scheduled
- [ ] Customer notifications sent
- [ ] Load balancer configured
- [ ] CDN cache invalidated
- [ ] Performance monitoring active
- [ ] Security monitoring active
EOF
            ;;
        "staging")
            cat >> "$CHECKLIST_FILE" << EOF
### Staging Deployment
- [ ] QA team notified
- [ ] Test data refreshed
- [ ] Feature flags verified
- [ ] Integration tests scheduled
EOF
            ;;
    esac
    
    log_success "Deployment checklist generated: $CHECKLIST_FILE"
}

# Generate final deployment report
generate_deployment_report() {
    log_info "📄 Generating final deployment validation report..."
    
    # Calculate deployment readiness
    local deployment_ready=false
    if [ $CRITICAL_FAILURES -eq 0 ]; then
        deployment_ready=true
    fi
    
    # Update final summary
    jq --arg total "$TOTAL_VALIDATIONS" \
       --arg passed "$PASSED_VALIDATIONS" \
       --arg failed "$FAILED_VALIDATIONS" \
       --arg warnings "$WARNING_VALIDATIONS" \
       --arg critical "$CRITICAL_FAILURES" \
       --arg ready "$deployment_ready" \
       '.summary = {
          "total": ($total | tonumber),
          "passed": ($passed | tonumber),
          "failed": ($failed | tonumber),
          "warnings": ($warnings | tonumber),
          "critical_failures": ($critical | tonumber),
          "deployment_ready": ($ready == "true"),
          "success_rate": (($passed | tonumber) * 100 / ($total | tonumber))
        }' "$REPORT_FILE" > tmp.json && mv tmp.json "$REPORT_FILE"
    
    log_success "Deployment validation report saved: $REPORT_FILE"
}

# Main execution
main() {
    local validation_type=${2:-"all"}
    
    case "$validation_type" in
        "build")
            init_deployment_validation
            validate_build
            ;;
        "environment")
            init_deployment_validation
            validate_environment
            ;;
        "database")
            init_deployment_validation
            validate_database
            ;;
        "docker")
            init_deployment_validation
            validate_docker
            ;;
        "security")
            init_deployment_validation
            validate_security
            ;;
        "monitoring")
            init_deployment_validation
            validate_monitoring
            ;;
        "backup")
            init_deployment_validation
            validate_backup_recovery
            ;;
        "performance")
            init_deployment_validation
            validate_performance
            ;;
        "all"|*)
            init_deployment_validation
            validate_build
            validate_environment
            validate_database
            validate_docker
            validate_security
            validate_monitoring
            validate_backup_recovery
            validate_performance
            generate_deployment_checklist
            generate_deployment_report
            ;;
    esac
    
    # Final summary
    echo ""
    echo "================================================================="
    log_info "🏁 Deployment Validation Complete for $DEPLOYMENT_ENV"
    echo "================================================================="
    echo ""
    echo "📊 Validation Summary:"
    echo "   Total Validations: $TOTAL_VALIDATIONS"
    echo "   Passed: $PASSED_VALIDATIONS"
    echo "   Failed: $FAILED_VALIDATIONS"
    echo "   Warnings: $WARNING_VALIDATIONS"
    echo "   Critical Failures: $CRITICAL_FAILURES"
    echo ""
    
    if [ $CRITICAL_FAILURES -gt 0 ]; then
        log_critical "🚨 DEPLOYMENT BLOCKED"
        echo "   $CRITICAL_FAILURES critical issues must be resolved before deployment"
        echo "   Review the detailed report: $REPORT_FILE"
        echo "   Review the checklist: $CHECKLIST_FILE"
        exit 1
    elif [ $FAILED_VALIDATIONS -gt 0 ]; then
        log_warning "⚠️ DEPLOYMENT WITH WARNINGS"
        echo "   $FAILED_VALIDATIONS issues should be addressed"
        echo "   Consider resolving warnings before proceeding"
        echo "   Review the detailed report: $REPORT_FILE"
        exit 2
    else
        log_success "✅ DEPLOYMENT READY"
        echo "   All critical validations passed"
        echo "   Environment is ready for deployment"
        echo "   Follow the checklist: $CHECKLIST_FILE"
        exit 0
    fi
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [environment] [validation_type]"
    echo ""
    echo "Environments:"
    echo "  staging      - Staging environment validation"
    echo "  production   - Production environment validation"
    echo "  development  - Development environment validation"
    echo ""
    echo "Validation types:"
    echo "  build        - Build artifacts validation"
    echo "  environment  - Environment configuration validation"
    echo "  database     - Database readiness validation"
    echo "  docker       - Docker configuration validation"
    echo "  security     - Security configuration validation"
    echo "  monitoring   - Monitoring and logging validation"
    echo "  backup       - Backup and recovery validation"
    echo "  performance  - Performance and scalability validation"
    echo "  all          - Run all validations (default)"
    echo ""
    echo "Examples:"
    echo "  $0 production           # Full production validation"
    echo "  $0 staging security     # Security validation for staging"
    echo "  $0 production docker    # Docker validation for production"
    echo ""
    exit 0
fi

# Validate environment parameter
case "$DEPLOYMENT_ENV" in
    "staging"|"production"|"development")
        ;;
    *)
        log_error "Invalid environment: $DEPLOYMENT_ENV"
        echo "Valid environments: staging, production, development"
        exit 1
        ;;
esac

# Run the deployment validation
main "$@"