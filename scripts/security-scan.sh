#!/bin/bash

# Security scanning script for VonkFi
# This script runs various security checks and scans

set -e

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

# Create reports directory
mkdir -p ./security-reports

log_info "🔒 Starting VonkFi Security Scan"
echo "=================================================="

# 1. Dependency vulnerability scan
log_info "📦 Running dependency vulnerability scan..."
if command -v npm >/dev/null 2>&1; then
    npm audit --audit-level=moderate --json > ./security-reports/npm-audit.json || true
    npm audit --audit-level=moderate > ./security-reports/npm-audit.txt || true
    
    # Check for high and critical vulnerabilities
    HIGH_VULNS=$(npm audit --audit-level=high --json 2>/dev/null | jq -r '.metadata.vulnerabilities.high // 0' || echo "0")
    CRITICAL_VULNS=$(npm audit --audit-level=critical --json 2>/dev/null | jq -r '.metadata.vulnerabilities.critical // 0' || echo "0")
    
    if [ "$HIGH_VULNS" -gt 0 ] || [ "$CRITICAL_VULNS" -gt 0 ]; then
        log_warning "Found $HIGH_VULNS high and $CRITICAL_VULNS critical vulnerabilities"
    else
        log_success "No high or critical vulnerabilities found"
    fi
else
    log_error "npm not found - skipping dependency scan"
fi

# 2. Secret detection scan
log_info "🔍 Scanning for secrets and sensitive data..."
if command -v git >/dev/null 2>&1; then
    # Check for common secret patterns
    SECRET_PATTERNS=(
        "password\s*[:=]\s*[\"'][^\"']*[\"']"
        "api[_-]?key\s*[:=]\s*[\"'][^\"']*[\"']"
        "secret\s*[:=]\s*[\"'][^\"']*[\"']"
        "token\s*[:=]\s*[\"'][^\"']*[\"']"
        "database[_-]?url\s*[:=]\s*[\"'][^\"']*[\"']"
        "-----BEGIN.*PRIVATE KEY-----"
        "sk_live_[a-zA-Z0-9]+"
        "pk_live_[a-zA-Z0-9]+"
    )
    
    SECRETS_FOUND=0
    for pattern in "${SECRET_PATTERNS[@]}"; do
        if git grep -E -i "$pattern" -- '*.ts' '*.js' '*.json' '*.yml' '*.yaml' 2>/dev/null | grep -v test | grep -v example; then
            SECRETS_FOUND=$((SECRETS_FOUND + 1))
        fi
    done
    
    if [ $SECRETS_FOUND -gt 0 ]; then
        log_warning "Found $SECRETS_FOUND potential secrets in code"
    else
        log_success "No obvious secrets found in code"
    fi
else
    log_warning "Git not available - skipping secret detection"
fi

# 3. Code security analysis with ESLint
log_info "⚡ Running static code security analysis..."
if command -v npx >/dev/null 2>&1; then
    if [ -f "./ci/eslint-security.config.js" ]; then
        npx eslint . --ext .ts,.tsx,.js,.jsx \
            --config ./ci/eslint-security.config.js \
            --format json \
            --output-file ./security-reports/eslint-security.json \
            --no-error-on-unmatched-pattern || true
        
        npx eslint . --ext .ts,.tsx,.js,.jsx \
            --config ./ci/eslint-security.config.js \
            --format unix > ./security-reports/eslint-security.txt || true
        
        log_success "Static code analysis completed"
    else
        log_warning "ESLint security config not found - skipping static analysis"
    fi
else
    log_warning "ESLint not available - skipping static analysis"
fi

# 4. TypeScript security check
log_info "📘 Running TypeScript security checks..."
if command -v npx >/dev/null 2>&1; then
    # Check for any TypeScript errors that might indicate security issues
    npx tsc --noEmit --strict > ./security-reports/typescript-check.txt 2>&1 || true
    
    # Look for specific security-related TypeScript issues
    TS_ERRORS=$(grep -c "error TS" ./security-reports/typescript-check.txt 2>/dev/null || echo "0")
    if [ "$TS_ERRORS" -gt 0 ]; then
        log_warning "Found $TS_ERRORS TypeScript errors that should be reviewed"
    else
        log_success "No TypeScript errors found"
    fi
else
    log_warning "TypeScript not available - skipping TS security checks"
fi

# 5. File permission checks
log_info "📁 Checking file permissions..."
PERMISSION_ISSUES=0

# Check for overly permissive files
find . -type f -perm -o+w -not -path "./node_modules/*" -not -path "./.git/*" > ./security-reports/world-writable-files.txt
WORLD_WRITABLE=$(wc -l < ./security-reports/world-writable-files.txt)

if [ "$WORLD_WRITABLE" -gt 0 ]; then
    log_warning "Found $WORLD_WRITABLE world-writable files"
    PERMISSION_ISSUES=$((PERMISSION_ISSUES + WORLD_WRITABLE))
else
    log_success "No world-writable files found"
fi

# Check for executable files that shouldn't be
find . -name "*.json" -o -name "*.md" -o -name "*.txt" | xargs ls -la | grep "^-..x" > ./security-reports/unexpected-executables.txt || true
UNEXPECTED_EXEC=$(wc -l < ./security-reports/unexpected-executables.txt)

if [ "$UNEXPECTED_EXEC" -gt 0 ]; then
    log_warning "Found $UNEXPECTED_EXEC unexpectedly executable files"
    PERMISSION_ISSUES=$((PERMISSION_ISSUES + UNEXPECTED_EXEC))
fi

# 6. Environment file security
log_info "🌍 Checking environment file security..."
ENV_ISSUES=0

# Check for .env files in git
if git ls-files | grep -E "\.env$|\.env\." >/dev/null 2>&1; then
    log_warning "Environment files found in git repository"
    git ls-files | grep -E "\.env$|\.env\." > ./security-reports/env-files-in-git.txt
    ENV_ISSUES=$((ENV_ISSUES + 1))
fi

# Check for example env files without actual env files
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    log_success "Good: .env.example exists but .env is not in repo"
else
    if [ -f ".env" ]; then
        log_warning "Warning: .env file exists - ensure it's in .gitignore"
    fi
fi

# 7. Docker security checks (if applicable)
log_info "🐳 Checking Docker security..."
if [ -f "Dockerfile" ]; then
    DOCKER_ISSUES=0
    
    # Check for running as root
    if grep -q "USER root" Dockerfile 2>/dev/null; then
        log_warning "Dockerfile may be running as root user"
        DOCKER_ISSUES=$((DOCKER_ISSUES + 1))
    fi
    
    # Check for ADD instead of COPY
    if grep -q "^ADD " Dockerfile 2>/dev/null; then
        log_warning "Dockerfile uses ADD instead of COPY"
        DOCKER_ISSUES=$((DOCKER_ISSUES + 1))
    fi
    
    # Check for --privileged flag in docker-compose
    if grep -q "privileged.*true" docker-compose*.yml 2>/dev/null; then
        log_warning "Docker compose uses privileged mode"
        DOCKER_ISSUES=$((DOCKER_ISSUES + 1))
    fi
    
    if [ $DOCKER_ISSUES -eq 0 ]; then
        log_success "Docker configuration looks secure"
    fi
else
    log_info "No Dockerfile found - skipping Docker security checks"
fi

# 8. Database security checks
log_info "🗄️  Checking database security configuration..."
DB_ISSUES=0

# Check for hardcoded database credentials
if grep -r -E "postgresql://.*:.*@" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null; then
    log_warning "Found potential hardcoded database credentials"
    DB_ISSUES=$((DB_ISSUES + 1))
fi

# Check migration files for potential issues
if [ -d "migrations" ]; then
    # Look for DROP statements in migrations
    if grep -r -i "DROP TABLE\|DROP DATABASE\|DROP SCHEMA" migrations/ 2>/dev/null; then
        log_warning "Found potentially dangerous DROP statements in migrations"
        DB_ISSUES=$((DB_ISSUES + 1))
    fi
    
    # Look for missing rollback files
    MIGRATION_COUNT=$(find migrations/ -name "*.sql" | wc -l)
    ROLLBACK_COUNT=$(find migrations/ -name "*rollback*" 2>/dev/null | wc -l)
    
    if [ $ROLLBACK_COUNT -eq 0 ] && [ $MIGRATION_COUNT -gt 0 ]; then
        log_warning "No rollback files found for migrations"
    fi
fi

# 9. API security checks
log_info "🌐 Checking API security configuration..."
API_ISSUES=0

# Check for missing authentication middleware
if ! grep -r "requireAuth\|authenticate" server/ 2>/dev/null >/dev/null; then
    log_warning "No authentication middleware found"
    API_ISSUES=$((API_ISSUES + 1))
fi

# Check for missing rate limiting
if ! grep -r "rateLimit\|rate.*limit" server/ 2>/dev/null >/dev/null; then
    log_warning "No rate limiting found"
    API_ISSUES=$((API_ISSUES + 1))
fi

# Check for CORS configuration
if ! grep -r "cors\|CORS" server/ 2>/dev/null >/dev/null; then
    log_warning "No CORS configuration found"
    API_ISSUES=$((API_ISSUES + 1))
fi

if [ $API_ISSUES -eq 0 ]; then
    log_success "API security configuration looks good"
fi

# 10. Generate summary report
log_info "📊 Generating security summary report..."

cat > ./security-reports/security-summary.md << EOF
# VonkFi Security Scan Summary

**Scan Date:** $(date)
**Scanned by:** Security Scan Script v1.0

## Summary

- **Dependency Vulnerabilities:** $HIGH_VULNS high, $CRITICAL_VULNS critical
- **Secrets Detection:** $SECRETS_FOUND potential issues found
- **TypeScript Errors:** $TS_ERRORS errors found
- **File Permission Issues:** $PERMISSION_ISSUES issues found
- **Environment File Issues:** $ENV_ISSUES issues found

## Recommendations

### High Priority
EOF

# Add high priority recommendations based on findings
if [ "$CRITICAL_VULNS" -gt 0 ]; then
    echo "- 🚨 **CRITICAL**: Update dependencies with critical vulnerabilities" >> ./security-reports/security-summary.md
fi

if [ $SECRETS_FOUND -gt 0 ]; then
    echo "- 🔑 **HIGH**: Review and remove hardcoded secrets from code" >> ./security-reports/security-summary.md
fi

cat >> ./security-reports/security-summary.md << EOF

### Medium Priority
- Review and update dependencies with high vulnerabilities
- Implement comprehensive input validation
- Add security headers to all API responses
- Implement proper session management

### Low Priority
- Regular security dependency updates
- Code review for security best practices
- Penetration testing for production deployment

## Detailed Reports

- npm audit: \`npm-audit.json\`
- ESLint security: \`eslint-security.json\`
- TypeScript check: \`typescript-check.txt\`
- File permissions: \`world-writable-files.txt\`

## Next Steps

1. Address all critical and high vulnerabilities
2. Review all flagged security issues
3. Implement missing security controls
4. Schedule regular security scans
5. Consider third-party security testing

EOF

# Final summary
echo ""
echo "=================================================="
log_info "🏁 Security scan completed"
echo "=================================================="

TOTAL_ISSUES=$((CRITICAL_VULNS + HIGH_VULNS + SECRETS_FOUND + TS_ERRORS + PERMISSION_ISSUES + ENV_ISSUES + DOCKER_ISSUES + DB_ISSUES + API_ISSUES))

if [ $TOTAL_ISSUES -eq 0 ]; then
    log_success "🎉 No major security issues found!"
    echo "The application appears to follow security best practices."
    exit 0
elif [ $TOTAL_ISSUES -lt 5 ]; then
    log_warning "⚠️  Found $TOTAL_ISSUES security issues"
    echo "Please review the detailed reports and address the issues."
    exit 1
else
    log_error "❌ Found $TOTAL_ISSUES security issues"
    echo "Immediate attention required. Review all security reports."
    exit 2
fi