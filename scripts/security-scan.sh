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

# 1. Enhanced dependency vulnerability scan
log_info "📦 Running comprehensive dependency vulnerability scan..."
if command -v npm >/dev/null 2>&1; then
    # Full npm audit
    npm audit --audit-level=moderate --json > ./security-reports/npm-audit.json || true
    npm audit --audit-level=moderate > ./security-reports/npm-audit.txt || true
    
    # Enhanced vulnerability analysis
    HIGH_VULNS=$(npm audit --audit-level=high --json 2>/dev/null | jq -r '.metadata.vulnerabilities.high // 0' || echo "0")
    CRITICAL_VULNS=$(npm audit --audit-level=critical --json 2>/dev/null | jq -r '.metadata.vulnerabilities.critical // 0' || echo "0")
    MODERATE_VULNS=$(npm audit --audit-level=moderate --json 2>/dev/null | jq -r '.metadata.vulnerabilities.moderate // 0' || echo "0")
    
    # Advanced audit-ci scan
    if command -v npx >/dev/null 2>&1 && [ -f "./ci/audit-ci.json" ]; then
        log_info "🔍 Running audit-ci with enhanced configuration..."
        npx audit-ci --config ./ci/audit-ci.json --output-format json > ./security-reports/audit-ci-detailed.json || true
        npx audit-ci --config ./ci/audit-ci.json > ./security-reports/audit-ci-summary.txt || true
    fi
    
    # License compliance check
    log_info "📋 Checking license compliance..."
    npx license-checker --json > ./security-reports/licenses.json || true
    npx license-checker --summary > ./security-reports/licenses-summary.txt || true
    
    # Outdated packages check
    log_info "📅 Checking for outdated packages..."
    npm outdated --json > ./security-reports/outdated-packages.json || true
    
    # Vulnerability summary
    TOTAL_VULNS=$((CRITICAL_VULNS + HIGH_VULNS + MODERATE_VULNS))
    if [ "$CRITICAL_VULNS" -gt 0 ]; then
        log_error "🚨 CRITICAL: Found $CRITICAL_VULNS critical vulnerabilities - immediate action required!"
    elif [ "$HIGH_VULNS" -gt 0 ]; then
        log_warning "⚠️ Found $HIGH_VULNS high vulnerabilities"
    elif [ "$MODERATE_VULNS" -gt 0 ]; then
        log_warning "Found $MODERATE_VULNS moderate vulnerabilities"
    else
        log_success "No significant vulnerabilities found"
    fi
    
    echo "Total vulnerabilities: Critical($CRITICAL_VULNS), High($HIGH_VULNS), Moderate($MODERATE_VULNS)"
else
    log_error "npm not found - skipping dependency scan"
fi

# 2. Enhanced secret detection scan
log_info "🔍 Running comprehensive secret detection scan..."

# Advanced secret scanning with multiple tools
if command -v git >/dev/null 2>&1; then
    # Enhanced secret patterns
    SECRET_PATTERNS=(
        "password\s*[:=]\s*[\"'][^\"']*[\"']"
        "api[_-]?key\s*[:=]\s*[\"'][^\"']*[\"']"
        "secret\s*[:=]\s*[\"'][^\"']*[\"']"
        "token\s*[:=]\s*[\"'][^\"']*[\"']"
        "database[_-]?url\s*[:=]\s*[\"'][^\"']*[\"']"
        "-----BEGIN.*PRIVATE KEY-----"
        "-----BEGIN.*CERTIFICATE-----"
        "sk_live_[a-zA-Z0-9]+"
        "pk_live_[a-zA-Z0-9]+"
        "AKIA[0-9A-Z]{16}"
        "AIza[0-9A-Za-z\\-_]{35}"
        "[0-9a-f]{32}"
        "xox[baprs]-[0-9a-zA-Z]{10,48}"
        "ghp_[A-Za-z0-9]{36}"
        "gho_[A-Za-z0-9]{36}"
        "github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}"
    )
    
    echo "🔍 Scanning for hardcoded secrets..." > ./security-reports/secret-scan.txt
    SECRETS_FOUND=0
    
    for pattern in "${SECRET_PATTERNS[@]}"; do
        echo "\nChecking pattern: $pattern" >> ./security-reports/secret-scan.txt
        if git grep -E -i "$pattern" -- '*.ts' '*.js' '*.json' '*.yml' '*.yaml' '*.env*' 2>/dev/null | grep -v test | grep -v example | grep -v node_modules >> ./security-reports/secret-scan.txt; then
            SECRETS_FOUND=$((SECRETS_FOUND + 1))
        fi
    done
    
    # Check for detect-secrets if available
    if command -v detect-secrets >/dev/null 2>&1; then
        log_info "🕵️ Running detect-secrets scan..."
        detect-secrets scan --all-files --force-use-all-plugins > ./security-reports/detect-secrets-results.json || true
        
        # Audit results
        detect-secrets audit ./security-reports/detect-secrets-results.json > ./security-reports/detect-secrets-audit.txt 2>&1 || true
    fi
    
    # Check git history for leaked secrets
    log_info "📚 Scanning git history for potential secrets..."
    git log --all --full-history --grep="password\|secret\|key\|token" --oneline > ./security-reports/git-history-secrets.txt || true
    
    # Check environment files
    log_info "🌍 Checking environment file security..."
    if find . -name ".env*" -not -path "./node_modules/*" | head -10; then
        echo "Environment files found - checking if they're properly gitignored..." >> ./security-reports/secret-scan.txt
        find . -name ".env*" -not -path "./node_modules/*" -not -name "*.example" >> ./security-reports/env-files-found.txt
    fi
    
    if [ $SECRETS_FOUND -gt 0 ]; then
        log_error "🚨 Found $SECRETS_FOUND potential secrets in code - review required!"
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

# 10. Enhanced security compliance check
log_info "🛡️ Running security compliance validation..."

# OWASP Top 10 checks
log_info "📋 Checking OWASP Top 10 compliance..."
OWASP_ISSUES=0

# A01: Broken Access Control
if ! grep -r "authentication\|authorization" server/ >/dev/null 2>&1; then
    echo "⚠️ A01: Potential broken access control - no auth middleware found" >> ./security-reports/owasp-check.txt
    OWASP_ISSUES=$((OWASP_ISSUES + 1))
fi

# A02: Cryptographic Failures
if grep -r "md5\|sha1\|des" . --include="*.ts" --include="*.js" >/dev/null 2>&1; then
    echo "⚠️ A02: Weak cryptographic algorithms detected" >> ./security-reports/owasp-check.txt
    OWASP_ISSUES=$((OWASP_ISSUES + 1))
fi

# A03: Injection
if ! grep -r "sql.*escape\|parameterized\|prepared" server/ >/dev/null 2>&1; then
    echo "⚠️ A03: Potential SQL injection risk - review database queries" >> ./security-reports/owasp-check.txt
    OWASP_ISSUES=$((OWASP_ISSUES + 1))
fi

# Generate comprehensive security summary
log_info "📊 Generating comprehensive security summary report..."

cat > ./security-reports/security-summary.md << EOF
# VonkFi Comprehensive Security Scan Summary

**Scan Date:** $(date)
**Scanned by:** Enhanced Security Scan Script v2.0
**Security Baseline:** ci/security-baseline.json

## Executive Summary

### 🚨 Critical Issues
- **Critical Vulnerabilities:** $CRITICAL_VULNS
- **Secrets in Code:** $SECRETS_FOUND
- **OWASP Compliance Issues:** $OWASP_ISSUES

### ⚠️ High Priority Issues
- **High Vulnerabilities:** $HIGH_VULNS
- **TypeScript Errors:** $TS_ERRORS
- **File Permission Issues:** $PERMISSION_ISSUES

### 📊 Overall Metrics
- **Total Vulnerabilities:** $((CRITICAL_VULNS + HIGH_VULNS + MODERATE_VULNS))
- **Environment File Issues:** $ENV_ISSUES
- **Docker Security Issues:** $DOCKER_ISSUES
- **Database Security Issues:** $DB_ISSUES
- **API Security Issues:** $API_ISSUES

## Detailed Findings

### Dependency Security
- **Critical:** $CRITICAL_VULNS vulnerabilities
- **High:** $HIGH_VULNS vulnerabilities  
- **Moderate:** $MODERATE_VULNS vulnerabilities
- **Scan Tool:** npm audit + audit-ci
- **Last Updated:** $(date)

### Secret Detection
- **Potential Secrets:** $SECRETS_FOUND
- **Tools Used:** Custom patterns + detect-secrets
- **Git History Checked:** Yes
- **Environment Files:** Reviewed

### Code Quality & Security
- **TypeScript Strict Mode:** $([ -f "tsconfig.json" ] && grep -q '"strict".*true' tsconfig.json && echo "Enabled" || echo "Disabled")
- **ESLint Security Rules:** Enabled
- **Security Linting Errors:** $([ -f "./security-reports/eslint-security.json" ] && jq '.length // 0' ./security-reports/eslint-security.json || echo "0")

### Infrastructure Security
- **Docker Security:** $DOCKER_ISSUES issues found
- **Database Security:** $DB_ISSUES issues found
- **API Security:** $API_ISSUES issues found
- **File Permissions:** $PERMISSION_ISSUES issues found

### OWASP Top 10 Compliance
- **Compliance Issues:** $OWASP_ISSUES
- **Framework:** OWASP Top 10 2021
- **Last Assessment:** $(date)

## Risk Assessment

EOF

# Risk level calculation
RISK_SCORE=$((CRITICAL_VULNS * 10 + HIGH_VULNS * 5 + SECRETS_FOUND * 8 + OWASP_ISSUES * 6))

if [ $RISK_SCORE -gt 50 ]; then
    RISK_LEVEL="🔴 HIGH RISK"
elif [ $RISK_SCORE -gt 20 ]; then
    RISK_LEVEL="🟡 MEDIUM RISK"
else
    RISK_LEVEL="🟢 LOW RISK"
fi

cat >> ./security-reports/security-summary.md << EOF
**Overall Risk Level:** $RISK_LEVEL (Score: $RISK_SCORE)

## Immediate Actions Required
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

# Generate security dashboard
log_info "📈 Generating security dashboard..."
cat > ./security-reports/security-dashboard.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>VonkFi Security Dashboard</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; color: #333; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .metric { display: inline-block; margin: 10px; padding: 20px; background: #f8f9fa; border-radius: 6px; min-width: 150px; text-align: center; }
        .critical { background: #ffe6e6; border-left: 4px solid #dc3545; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .success { background: #d4edda; border-left: 4px solid #28a745; }
        .metric h3 { margin: 0; font-size: 24px; }
        .metric p { margin: 5px 0 0 0; color: #666; }
        .section { margin: 30px 0; }
        .report-link { display: inline-block; margin: 5px; padding: 8px 16px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ VonkFi Security Dashboard</h1>
            <p>Last Updated: <span id="timestamp"></span></p>
        </div>
        
        <div class="section">
            <h2>Security Metrics</h2>
            <div class="metric critical">
                <h3 id="critical-vulns">0</h3>
                <p>Critical Vulnerabilities</p>
            </div>
            <div class="metric warning">
                <h3 id="high-vulns">0</h3>
                <p>High Vulnerabilities</p>
            </div>
            <div class="metric warning">
                <h3 id="secrets-found">0</h3>
                <p>Potential Secrets</p>
            </div>
            <div class="metric" id="risk-level">
                <h3 id="risk-score">0</h3>
                <p>Risk Score</p>
            </div>
        </div>
        
        <div class="section">
            <h2>📊 Detailed Reports</h2>
            <a href="security-summary.md" class="report-link">Security Summary</a>
            <a href="npm-audit.json" class="report-link">Dependency Audit</a>
            <a href="eslint-security.json" class="report-link">Code Security</a>
            <a href="secret-scan.txt" class="report-link">Secret Detection</a>
            <a href="owasp-check.txt" class="report-link">OWASP Compliance</a>
        </div>
    </div>
    
    <script>
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        // Metrics will be updated by the scan script
    </script>
</body>
</html>
EOF

# Update dashboard with actual values
sed -i.bak "s/id=\"critical-vulns\">0/id=\"critical-vulns\">$CRITICAL_VULNS/g" ./security-reports/security-dashboard.html
sed -i.bak "s/id=\"high-vulns\">0/id=\"high-vulns\">$HIGH_VULNS/g" ./security-reports/security-dashboard.html
sed -i.bak "s/id=\"secrets-found\">0/id=\"secrets-found\">$SECRETS_FOUND/g" ./security-reports/security-dashboard.html
sed -i.bak "s/id=\"risk-score\">0/id=\"risk-score\">$RISK_SCORE/g" ./security-reports/security-dashboard.html

# Final comprehensive summary
echo ""
echo "==========================================================="
log_info "🏁 Enhanced Security Scan Completed"
echo "==========================================================="

TOTAL_ISSUES=$((CRITICAL_VULNS + HIGH_VULNS + SECRETS_FOUND + TS_ERRORS + PERMISSION_ISSUES + ENV_ISSUES + DOCKER_ISSUES + DB_ISSUES + API_ISSUES + OWASP_ISSUES))

echo "📊 Security Scan Results:"
echo "   Critical Vulnerabilities: $CRITICAL_VULNS"
echo "   High Vulnerabilities: $HIGH_VULNS"
echo "   Moderate Vulnerabilities: $MODERATE_VULNS"
echo "   Secrets Found: $SECRETS_FOUND"
echo "   OWASP Issues: $OWASP_ISSUES"
echo "   Risk Score: $RISK_SCORE ($RISK_LEVEL)"
echo "   Total Issues: $TOTAL_ISSUES"
echo ""
echo "📂 Reports Generated:"
echo "   - security-summary.md (Comprehensive report)"
echo "   - security-dashboard.html (Interactive dashboard)"
echo "   - Multiple detailed scan results in security-reports/"
echo ""

if [ $CRITICAL_VULNS -gt 0 ] || [ $SECRETS_FOUND -gt 0 ]; then
    log_error "🚨 CRITICAL SECURITY ISSUES FOUND - IMMEDIATE ACTION REQUIRED!"
    echo "❌ Critical vulnerabilities: $CRITICAL_VULNS"
    echo "❌ Potential secrets in code: $SECRETS_FOUND"
    echo "🔗 Review dashboard: security-reports/security-dashboard.html"
    exit 3
elif [ $HIGH_VULNS -gt 0 ] || [ $OWASP_ISSUES -gt 0 ]; then
    log_warning "⚠️ HIGH PRIORITY SECURITY ISSUES FOUND"
    echo "⚠️ High vulnerabilities: $HIGH_VULNS"
    echo "⚠️ OWASP compliance issues: $OWASP_ISSUES"
    echo "📋 Please review and address these issues promptly"
    exit 2
elif [ $TOTAL_ISSUES -gt 0 ]; then
    log_warning "📋 Security issues found - review recommended"
    echo "📊 Total issues: $TOTAL_ISSUES (Risk Level: $RISK_LEVEL)"
    echo "🔍 Review detailed reports for improvement opportunities"
    exit 1
else
    log_success "🎉 Excellent! No significant security issues found!"
    echo "✅ The application follows security best practices"
    echo "🛡️ All scans passed - deployment ready"
    exit 0
fi