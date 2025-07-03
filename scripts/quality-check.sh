#!/bin/bash

# Enhanced Quality Gates Validation Script
# Implements comprehensive code quality checks and gates

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
QUALITY_DIR="./quality-reports"
QUALITY_CONFIG="./ci/quality-gates.yml"
RESULTS_FILE="$QUALITY_DIR/quality-results.json"
REPORT_FILE="$QUALITY_DIR/quality-report.html"

# Global counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0
BLOCKING_FAILURES=0

# Quality gates status
declare -A GATE_STATUS
declare -A GATE_DETAILS

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$QUALITY_DIR/quality.log"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$QUALITY_DIR/quality.log"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$QUALITY_DIR/quality.log"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$QUALITY_DIR/quality.log"
}

log_gate() {
    echo -e "${PURPLE}[GATE]${NC} $1" | tee -a "$QUALITY_DIR/quality.log"
}

# Initialize quality checking
init_quality_check() {
    log_info "🔍 Initializing comprehensive quality checks..."
    
    # Create quality reports directory
    mkdir -p "$QUALITY_DIR"
    
    # Initialize results file
    cat > "$RESULTS_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "version": "2.0",
  "pipeline": {
    "id": "${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-local}}",
    "branch": "${CI_COMMIT_REF_NAME:-${GITHUB_REF_NAME:-unknown}}",
    "commit": "${CI_COMMIT_SHA:-${GITHUB_SHA:-unknown}}"
  },
  "gates": {},
  "summary": {
    "total_checks": 0,
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "blocking_failures": 0
  }
}
EOF
    
    log_success "Quality check environment initialized"
}

# Helper function to update gate status
update_gate_status() {
    local gate_name="$1"
    local status="$2"  # pass, fail, warn
    local details="$3"
    local is_blocking="${4:-false}"
    
    GATE_STATUS["$gate_name"]="$status"
    GATE_DETAILS["$gate_name"]="$details"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case "$status" in
        "pass")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            log_success "✅ $gate_name: $details"
            ;;
        "fail")
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
            if [ "$is_blocking" = "true" ]; then
                BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
                log_error "❌ $gate_name: $details (BLOCKING)"
            else
                log_error "❌ $gate_name: $details"
            fi
            ;;
        "warn")
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            log_warning "⚠️ $gate_name: $details"
            ;;
    esac
    
    # Update results file
    jq --arg gate "$gate_name" \
       --arg status "$status" \
       --arg details "$details" \
       --arg blocking "$is_blocking" \
       '.gates[$gate] = {
          "status": $status,
          "details": $details,
          "blocking": ($blocking == "true"),
          "timestamp": now | strftime("%Y-%m-%dT%H:%M:%SZ")
        }' "$RESULTS_FILE" > tmp.json && mv tmp.json "$RESULTS_FILE"
}

# TypeScript quality gate
check_typescript_quality() {
    log_gate "🔷 Running TypeScript Quality Gate..."
    
    if [ ! -f "tsconfig.json" ]; then
        update_gate_status "typescript" "warn" "No tsconfig.json found" "false"
        return
    fi
    
    # Type checking
    log_info "Running TypeScript type checking..."
    if npx tsc --noEmit --strict > "$QUALITY_DIR/typescript-check.txt" 2>&1; then
        update_gate_status "typescript.type_check" "pass" "Type checking passed" "true"
    else
        local error_count=$(grep -c "error TS" "$QUALITY_DIR/typescript-check.txt" || echo "0")
        update_gate_status "typescript.type_check" "fail" "Found $error_count TypeScript errors" "true"
    fi
    
    # Check for strict mode
    if grep -q '"strict".*true' tsconfig.json; then
        update_gate_status "typescript.strict_mode" "pass" "Strict mode enabled" "false"
    else
        update_gate_status "typescript.strict_mode" "warn" "Strict mode not enabled" "false"
    fi
    
    # Check for noImplicitAny
    if grep -q '"noImplicitAny".*true' tsconfig.json; then
        update_gate_status "typescript.no_implicit_any" "pass" "noImplicitAny enabled" "false"
    else
        update_gate_status "typescript.no_implicit_any" "warn" "noImplicitAny not enabled" "false"
    fi
}

# ESLint quality gate
check_eslint_quality() {
    log_gate "🔧 Running ESLint Quality Gate..."
    
    if [ ! -f "./ci/eslint-security.config.js" ]; then
        update_gate_status "eslint" "warn" "ESLint config not found" "false"
        return
    fi
    
    # Run ESLint
    log_info "Running ESLint analysis..."
    if npx eslint . --ext .ts,.tsx,.js,.jsx \
        --config ./ci/eslint-security.config.js \
        --format json \
        --output-file "$QUALITY_DIR/eslint-results.json" \
        --no-error-on-unmatched-pattern 2>/dev/null; then
        
        local error_count=0
        local warning_count=0
        
        if [ -f "$QUALITY_DIR/eslint-results.json" ]; then
            error_count=$(jq '[.[] | .errorCount] | add // 0' "$QUALITY_DIR/eslint-results.json")
            warning_count=$(jq '[.[] | .warningCount] | add // 0' "$QUALITY_DIR/eslint-results.json")
        fi
        
        # Check error threshold
        if [ "$error_count" -eq 0 ]; then
            update_gate_status "eslint.errors" "pass" "No ESLint errors" "true"
        else
            update_gate_status "eslint.errors" "fail" "Found $error_count ESLint errors" "true"
        fi
        
        # Check warning threshold
        if [ "$warning_count" -le 20 ]; then
            update_gate_status "eslint.warnings" "pass" "ESLint warnings within threshold ($warning_count/20)" "false"
        else
            update_gate_status "eslint.warnings" "warn" "ESLint warnings exceed threshold ($warning_count/20)" "false"
        fi
        
    else
        update_gate_status "eslint" "fail" "ESLint execution failed" "true"
    fi
    
    # Check for security-specific rules
    if grep -q "security/" ./ci/eslint-security.config.js; then
        update_gate_status "eslint.security_rules" "pass" "Security ESLint rules configured" "false"
    else
        update_gate_status "eslint.security_rules" "warn" "Security ESLint rules not configured" "false"
    fi
}

# Test quality gate
check_test_quality() {
    log_gate "🧪 Running Test Quality Gate..."
    
    # Test execution
    log_info "Analyzing test execution results..."
    
    local total_tests=0
    local passed_tests=0
    local failed_tests=0
    
    # Check if test results exist
    if [ -d "test-results" ] && [ "$(ls -A test-results)" ]; then
        for result_file in test-results/*.json; do
            if [ -f "$result_file" ] && command -v jq >/dev/null 2>&1; then
                local file_total=$(jq '.numTotalTests // .testResults[].numTotalTests // 0' "$result_file" 2>/dev/null | head -1)
                local file_passed=$(jq '.numPassedTests // .testResults[].numPassedTests // 0' "$result_file" 2>/dev/null | head -1)
                local file_failed=$(jq '.numFailedTests // .testResults[].numFailedTests // 0' "$result_file" 2>/dev/null | head -1)
                
                total_tests=$((total_tests + ${file_total:-0}))
                passed_tests=$((passed_tests + ${file_passed:-0}))
                failed_tests=$((failed_tests + ${file_failed:-0}))
            fi
        done
        
        # Calculate success rate
        if [ $total_tests -gt 0 ]; then
            local success_rate=$(( passed_tests * 100 / total_tests ))
            
            if [ $success_rate -eq 100 ]; then
                update_gate_status "test.execution" "pass" "All tests passed ($passed_tests/$total_tests)" "true"
            else
                update_gate_status "test.execution" "fail" "Tests failed: $failed_tests/$total_tests (${success_rate}% success)" "true"
            fi
        else
            update_gate_status "test.execution" "warn" "No test results found" "true"
        fi
    else
        update_gate_status "test.execution" "warn" "No test results available" "true"
    fi
    
    # Coverage analysis
    log_info "Analyzing test coverage..."
    if [ -f "coverage/coverage-summary.json" ]; then
        local coverage_lines=$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        local coverage_statements=$(jq '.total.statements.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        local coverage_branches=$(jq '.total.branches.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        local coverage_functions=$(jq '.total.functions.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        
        # Check coverage thresholds
        if [ "${coverage_lines%.*}" -ge 80 ] && [ "${coverage_statements%.*}" -ge 80 ] && \
           [ "${coverage_branches%.*}" -ge 75 ] && [ "${coverage_functions%.*}" -ge 80 ]; then
            update_gate_status "test.coverage" "pass" "Coverage meets thresholds (L:${coverage_lines}% S:${coverage_statements}% B:${coverage_branches}% F:${coverage_functions}%)" "true"
        else
            update_gate_status "test.coverage" "fail" "Coverage below thresholds (L:${coverage_lines}% S:${coverage_statements}% B:${coverage_branches}% F:${coverage_functions}%)" "true"
        fi
    else
        update_gate_status "test.coverage" "warn" "No coverage data available" "true"
    fi
    
    # Test file quality
    log_info "Checking test file quality..."
    local test_files_count=$(find test -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l)
    local source_files_count=$(find src server -name "*.ts" -not -name "*.d.ts" 2>/dev/null | wc -l)
    
    if [ $test_files_count -gt 0 ] && [ $source_files_count -gt 0 ]; then
        local test_ratio=$(( test_files_count * 100 / source_files_count ))
        
        if [ $test_ratio -ge 30 ]; then
            update_gate_status "test.file_ratio" "pass" "Good test-to-source ratio: $test_files_count tests for $source_files_count source files (${test_ratio}%)" "false"
        else
            update_gate_status "test.file_ratio" "warn" "Low test-to-source ratio: $test_files_count tests for $source_files_count source files (${test_ratio}%)" "false"
        fi
    fi
}

# Security quality gate
check_security_quality() {
    log_gate "🔒 Running Security Quality Gate..."
    
    # Check for vulnerability scan results
    local critical_vulns=0
    local high_vulns=0
    local moderate_vulns=0
    local secrets_found=0
    
    if [ -f "security-reports/npm-audit.json" ]; then
        critical_vulns=$(jq '.metadata.vulnerabilities.critical // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
        high_vulns=$(jq '.metadata.vulnerabilities.high // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
        moderate_vulns=$(jq '.metadata.vulnerabilities.moderate // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
    fi
    
    # Critical vulnerabilities check
    if [ "$critical_vulns" -eq 0 ]; then
        update_gate_status "security.critical_vulns" "pass" "No critical vulnerabilities found" "true"
    else
        update_gate_status "security.critical_vulns" "fail" "Found $critical_vulns critical vulnerabilities" "true"
    fi
    
    # High vulnerabilities check
    if [ "$high_vulns" -eq 0 ]; then
        update_gate_status "security.high_vulns" "pass" "No high vulnerabilities found" "true"
    else
        update_gate_status "security.high_vulns" "fail" "Found $high_vulns high vulnerabilities" "true"
    fi
    
    # Moderate vulnerabilities check
    if [ "$moderate_vulns" -le 5 ]; then
        update_gate_status "security.moderate_vulns" "pass" "Moderate vulnerabilities within threshold ($moderate_vulns/5)" "false"
    else
        update_gate_status "security.moderate_vulns" "warn" "Moderate vulnerabilities exceed threshold ($moderate_vulns/5)" "false"
    fi
    
    # Secret detection
    if [ -f "security-reports/secret-scan.txt" ]; then
        secrets_found=$(grep -c "potential secret" security-reports/secret-scan.txt 2>/dev/null || echo "0")
    fi
    
    if [ "$secrets_found" -eq 0 ]; then
        update_gate_status "security.secrets" "pass" "No secrets detected in code" "true"
    else
        update_gate_status "security.secrets" "fail" "Found $secrets_found potential secrets in code" "true"
    fi
    
    # License compliance check
    log_info "Checking license compliance..."
    if command -v npx >/dev/null 2>&1; then
        if npx license-checker --summary > "$QUALITY_DIR/license-check.txt" 2>/dev/null; then
            # Check for blocked licenses
            local blocked_licenses=$(grep -E "(GPL|AGPL|LGPL)" "$QUALITY_DIR/license-check.txt" || true)
            
            if [ -z "$blocked_licenses" ]; then
                update_gate_status "security.licenses" "pass" "No blocked licenses found" "false"
            else
                update_gate_status "security.licenses" "warn" "Potential license compliance issues detected" "false"
            fi
        else
            update_gate_status "security.licenses" "warn" "License check failed to run" "false"
        fi
    fi
}

# Performance quality gate
check_performance_quality() {
    log_gate "⚡ Running Performance Quality Gate..."
    
    # Build size check
    if [ -d "dist" ] || [ -d "build" ]; then
        local build_size=$(du -sm dist build 2>/dev/null | awk '{sum += $1} END {print sum}' || echo "0")
        
        if [ "$build_size" -le 100 ]; then
            update_gate_status "performance.build_size" "pass" "Build size within limits (${build_size}MB/100MB)" "false"
        else
            update_gate_status "performance.build_size" "warn" "Build size exceeds recommended limit (${build_size}MB/100MB)" "false"
        fi
    else
        update_gate_status "performance.build_size" "warn" "No build artifacts found" "false"
    fi
    
    # Dependency count check
    if [ -f "package.json" ]; then
        local deps_count=$(jq '.dependencies | length' package.json 2>/dev/null || echo "0")
        local dev_deps_count=$(jq '.devDependencies | length' package.json 2>/dev/null || echo "0")
        local total_deps=$((deps_count + dev_deps_count))
        
        if [ $total_deps -le 200 ]; then
            update_gate_status "performance.dependencies" "pass" "Dependency count within limits ($total_deps/200)" "false"
        else
            update_gate_status "performance.dependencies" "warn" "High dependency count ($total_deps/200)" "false"
        fi
    fi
    
    # Node modules size check
    if [ -d "node_modules" ]; then
        local nm_size=$(du -sm node_modules 2>/dev/null | awk '{print $1}' || echo "0")
        
        if [ "$nm_size" -le 1000 ]; then
            update_gate_status "performance.node_modules" "pass" "Node modules size reasonable (${nm_size}MB)" "false"
        else
            update_gate_status "performance.node_modules" "warn" "Large node_modules directory (${nm_size}MB)" "false"
        fi
    fi
}

# Documentation quality gate
check_documentation_quality() {
    log_gate "📚 Running Documentation Quality Gate..."
    
    # README check
    if [ -f "README.md" ]; then
        local readme_size=$(wc -c < README.md)
        
        if [ $readme_size -ge 1000 ]; then
            update_gate_status "documentation.readme" "pass" "README.md has adequate content ($readme_size chars)" "false"
        else
            update_gate_status "documentation.readme" "warn" "README.md is too short ($readme_size chars)" "false"
        fi
        
        # Check for required sections
        local missing_sections=""
        for section in "Installation" "Usage" "Contributing" "License"; do
            if ! grep -qi "$section" README.md; then
                missing_sections="$missing_sections $section"
            fi
        done
        
        if [ -z "$missing_sections" ]; then
            update_gate_status "documentation.readme_sections" "pass" "README contains all required sections" "false"
        else
            update_gate_status "documentation.readme_sections" "warn" "README missing sections:$missing_sections" "false"
        fi
    else
        update_gate_status "documentation.readme" "warn" "No README.md found" "false"
    fi
    
    # API documentation check
    if [ -f "docs/api.md" ] || [ -f "api-docs.md" ] || [ -d "docs" ]; then
        update_gate_status "documentation.api" "pass" "API documentation found" "false"
    else
        update_gate_status "documentation.api" "warn" "No API documentation found" "false"
    fi
    
    # Code comments check
    local ts_files_with_comments=0
    local total_ts_files=0
    
    if command -v find >/dev/null 2>&1; then
        total_ts_files=$(find src server -name "*.ts" -not -name "*.d.ts" 2>/dev/null | wc -l)
        ts_files_with_comments=$(find src server -name "*.ts" -not -name "*.d.ts" -exec grep -l "/\*\*\\|//" {} \; 2>/dev/null | wc -l)
        
        if [ $total_ts_files -gt 0 ]; then
            local comment_ratio=$(( ts_files_with_comments * 100 / total_ts_files ))
            
            if [ $comment_ratio -ge 50 ]; then
                update_gate_status "documentation.code_comments" "pass" "Good code documentation ratio (${comment_ratio}%)" "false"
            else
                update_gate_status "documentation.code_comments" "warn" "Low code documentation ratio (${comment_ratio}%)" "false"
            fi
        fi
    fi
}

# Deployment readiness gate
check_deployment_readiness() {
    log_gate "🚀 Running Deployment Readiness Gate..."
    
    # Environment configuration check
    local env_files=(".env.example" ".env.test.example" ".env.production.example")
    local missing_env_files=""
    
    for env_file in "${env_files[@]}"; do
        if [ ! -f "$env_file" ]; then
            missing_env_files="$missing_env_files $env_file"
        fi
    done
    
    if [ -z "$missing_env_files" ]; then
        update_gate_status "deployment.env_config" "pass" "All environment configuration files present" "false"
    else
        update_gate_status "deployment.env_config" "warn" "Missing environment files:$missing_env_files" "false"
    fi
    
    # Docker configuration check
    if [ -f "Dockerfile" ]; then
        # Basic Dockerfile validation
        if grep -q "FROM" Dockerfile && grep -q "WORKDIR" Dockerfile; then
            update_gate_status "deployment.docker" "pass" "Dockerfile has basic structure" "false"
        else
            update_gate_status "deployment.docker" "warn" "Dockerfile may be incomplete" "false"
        fi
        
        # Multi-stage build check
        if grep -q "FROM.*AS" Dockerfile; then
            update_gate_status "deployment.docker_multistage" "pass" "Multi-stage Docker build configured" "false"
        else
            update_gate_status "deployment.docker_multistage" "warn" "Single-stage Docker build (consider multi-stage)" "false"
        fi
    else
        update_gate_status "deployment.docker" "warn" "No Dockerfile found" "false"
    fi
    
    # Health check endpoint
    if grep -r "health" server/ --include="*.ts" >/dev/null 2>&1; then
        update_gate_status "deployment.health_check" "pass" "Health check endpoint implemented" "false"
    else
        update_gate_status "deployment.health_check" "warn" "No health check endpoint found" "false"
    fi
    
    # Database migration check
    if [ -d "migrations" ] && [ "$(ls -A migrations)" ]; then
        update_gate_status "deployment.migrations" "pass" "Database migrations present" "false"
    else
        update_gate_status "deployment.migrations" "warn" "No database migrations found" "false"
    fi
}

# Generate comprehensive quality report
generate_quality_report() {
    log_info "📊 Generating comprehensive quality report..."
    
    # Update summary in results file
    jq --arg total "$TOTAL_CHECKS" \
       --arg passed "$PASSED_CHECKS" \
       --arg failed "$FAILED_CHECKS" \
       --arg warnings "$WARNING_CHECKS" \
       --arg blocking "$BLOCKING_FAILURES" \
       '.summary = {
          "total_checks": ($total | tonumber),
          "passed": ($passed | tonumber),
          "failed": ($failed | tonumber),
          "warnings": ($warnings | tonumber),
          "blocking_failures": ($blocking | tonumber),
          "success_rate": (($passed | tonumber) * 100 / ($total | tonumber)),
          "overall_status": (if ($blocking | tonumber) > 0 then "FAILED" elif ($failed | tonumber) > 0 then "WARNING" else "PASSED" end)
        }' "$RESULTS_FILE" > tmp.json && mv tmp.json "$RESULTS_FILE"
    
    # Generate HTML report
    cat > "$REPORT_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>VonkFi Quality Gates Report</title>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 1400px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; text-align: center; }
        .header h1 { margin: 0; color: #2c3e50; font-size: 2.5em; }
        .header .subtitle { color: #7f8c8d; margin-top: 10px; font-size: 1.1em; }
        
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 2em; }
        .summary-card p { margin: 0; color: #7f8c8d; font-size: 1.1em; }
        .summary-card.passed { border-left: 5px solid #27ae60; }
        .summary-card.failed { border-left: 5px solid #e74c3c; }
        .summary-card.warning { border-left: 5px solid #f39c12; }
        .summary-card.total { border-left: 5px solid #3498db; }
        
        .gates-section { background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
        .gates-header { background: #34495e; color: white; padding: 20px; margin: 0; }
        .gates-content { padding: 0; }
        
        .gate-category { border-bottom: 1px solid #ecf0f1; }
        .gate-category:last-child { border-bottom: none; }
        .category-header { background: #f8f9fa; padding: 15px 20px; font-weight: bold; color: #2c3e50; border-bottom: 1px solid #ecf0f1; }
        .gate-item { padding: 15px 20px; border-bottom: 1px solid #ecf0f1; display: flex; align-items: center; justify-content: space-between; }
        .gate-item:last-child { border-bottom: none; }
        .gate-name { font-weight: 500; color: #2c3e50; }
        .gate-details { color: #7f8c8d; font-size: 0.9em; margin-top: 5px; }
        .gate-status { padding: 6px 12px; border-radius: 20px; font-size: 0.8em; font-weight: bold; text-transform: uppercase; }
        .gate-status.passed { background: #d5f4e6; color: #27ae60; }
        .gate-status.failed { background: #fdeaea; color: #e74c3c; }
        .gate-status.warning { background: #fef5e7; color: #f39c12; }
        .gate-status.blocking { background: #e74c3c; color: white; }
        
        .recommendations { background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-top: 30px; padding: 30px; }
        .recommendations h2 { color: #2c3e50; margin-top: 0; }
        .recommendation { background: #f8f9fa; border-left: 4px solid #3498db; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
        .recommendation.critical { border-left-color: #e74c3c; }
        .recommendation.warning { border-left-color: #f39c12; }
        .recommendation.info { border-left-color: #3498db; }
        
        .footer { text-align: center; margin-top: 40px; color: #7f8c8d; }
        .timestamp { font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Quality Gates Report</h1>
            <p class="subtitle">Comprehensive code quality analysis for VonkFi</p>
            <p class="timestamp">Generated: <span id="timestamp"></span></p>
        </div>
        
        <div class="summary">
            <div class="summary-card total">
                <h3 id="total-checks">-</h3>
                <p>Total Checks</p>
            </div>
            <div class="summary-card passed">
                <h3 id="passed-checks">-</h3>
                <p>Passed</p>
            </div>
            <div class="summary-card failed">
                <h3 id="failed-checks">-</h3>
                <p>Failed</p>
            </div>
            <div class="summary-card warning">
                <h3 id="warning-checks">-</h3>
                <p>Warnings</p>
            </div>
        </div>
        
        <div class="gates-section">
            <h2 class="gates-header">Quality Gate Results</h2>
            <div class="gates-content" id="gates-content">
                <!-- Gates will be populated by JavaScript -->
            </div>
        </div>
        
        <div class="recommendations">
            <h2>🎯 Recommendations</h2>
            <div id="recommendations-content">
                <!-- Recommendations will be populated by JavaScript -->
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by VonkFi Quality Gates System v2.0</p>
        </div>
    </div>
    
    <script>
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        
        // Load and display results
        fetch('./quality-results.json')
            .then(response => response.json())
            .then(data => {
                // Update summary
                document.getElementById('total-checks').textContent = data.summary.total_checks;
                document.getElementById('passed-checks').textContent = data.summary.passed;
                document.getElementById('failed-checks').textContent = data.summary.failed;
                document.getElementById('warning-checks').textContent = data.summary.warnings;
                
                // Group gates by category
                const categories = {
                    'TypeScript': [],
                    'ESLint': [],
                    'Tests': [],
                    'Security': [],
                    'Performance': [],
                    'Documentation': [],
                    'Deployment': []
                };
                
                for (const [gateName, gateData] of Object.entries(data.gates)) {
                    if (gateName.startsWith('typescript')) categories['TypeScript'].push([gateName, gateData]);
                    else if (gateName.startsWith('eslint')) categories['ESLint'].push([gateName, gateData]);
                    else if (gateName.startsWith('test')) categories['Tests'].push([gateName, gateData]);
                    else if (gateName.startsWith('security')) categories['Security'].push([gateName, gateData]);
                    else if (gateName.startsWith('performance')) categories['Performance'].push([gateName, gateData]);
                    else if (gateName.startsWith('documentation')) categories['Documentation'].push([gateName, gateData]);
                    else if (gateName.startsWith('deployment')) categories['Deployment'].push([gateName, gateData]);
                }
                
                // Generate gates HTML
                let gatesHTML = '';
                for (const [category, gates] of Object.entries(categories)) {
                    if (gates.length > 0) {
                        gatesHTML += `<div class="gate-category">`;
                        gatesHTML += `<div class="category-header">${category}</div>`;
                        
                        for (const [gateName, gateData] of gates) {
                            const statusClass = gateData.blocking && gateData.status === 'failed' ? 'blocking' : gateData.status;
                            gatesHTML += `
                                <div class="gate-item">
                                    <div>
                                        <div class="gate-name">${gateName}</div>
                                        <div class="gate-details">${gateData.details}</div>
                                    </div>
                                    <div class="gate-status ${statusClass}">${gateData.status}${gateData.blocking && gateData.status === 'failed' ? ' (BLOCKING)' : ''}</div>
                                </div>
                            `;
                        }
                        
                        gatesHTML += `</div>`;
                    }
                }
                
                document.getElementById('gates-content').innerHTML = gatesHTML;
                
                // Generate recommendations
                let recommendationsHTML = '';
                
                if (data.summary.blocking_failures > 0) {
                    recommendationsHTML += `
                        <div class="recommendation critical">
                            <strong>🚨 Critical Issues:</strong> ${data.summary.blocking_failures} blocking failures must be resolved before deployment.
                        </div>
                    `;
                }
                
                if (data.summary.failed > data.summary.blocking_failures) {
                    recommendationsHTML += `
                        <div class="recommendation warning">
                            <strong>⚠️ Non-blocking Failures:</strong> ${data.summary.failed - data.summary.blocking_failures} issues should be addressed to improve code quality.
                        </div>
                    `;
                }
                
                if (data.summary.warnings > 0) {
                    recommendationsHTML += `
                        <div class="recommendation info">
                            <strong>💡 Improvement Opportunities:</strong> ${data.summary.warnings} warnings indicate areas for enhancement.
                        </div>
                    `;
                }
                
                if (data.summary.blocking_failures === 0) {
                    recommendationsHTML += `
                        <div class="recommendation info">
                            <strong>✅ Deployment Ready:</strong> No blocking issues found. Code meets minimum quality standards for deployment.
                        </div>
                    `;
                }
                
                document.getElementById('recommendations-content').innerHTML = recommendationsHTML;
            })
            .catch(error => {
                console.error('Error loading quality results:', error);
                document.getElementById('gates-content').innerHTML = '<p style="padding: 20px; text-align: center; color: #e74c3c;">Error loading quality gate results</p>';
            });
    </script>
</body>
</html>
EOF
    
    log_success "Quality report generated: $REPORT_FILE"
}

# Main execution
main() {
    local action=${1:-"all"}
    
    case "$action" in
        "typescript")
            init_quality_check
            check_typescript_quality
            ;;
        "eslint")
            init_quality_check
            check_eslint_quality
            ;;
        "test")
            init_quality_check
            check_test_quality
            ;;
        "security")
            init_quality_check
            check_security_quality
            ;;
        "performance")
            init_quality_check
            check_performance_quality
            ;;
        "documentation")
            init_quality_check
            check_documentation_quality
            ;;
        "deployment")
            init_quality_check
            check_deployment_readiness
            ;;
        "all"|*)
            init_quality_check
            check_typescript_quality
            check_eslint_quality
            check_test_quality
            check_security_quality
            check_performance_quality
            check_documentation_quality
            check_deployment_readiness
            generate_quality_report
            ;;
    esac
    
    # Final summary
    echo ""
    echo "======================================================"
    log_info "🏁 Quality Gates Analysis Complete"
    echo "======================================================"
    echo ""
    echo "📊 Summary:"
    echo "   Total Checks: $TOTAL_CHECKS"
    echo "   Passed: $PASSED_CHECKS"
    echo "   Failed: $FAILED_CHECKS"
    echo "   Warnings: $WARNING_CHECKS"
    echo "   Blocking Failures: $BLOCKING_FAILURES"
    echo ""
    
    if [ $BLOCKING_FAILURES -gt 0 ]; then
        log_error "❌ QUALITY GATES FAILED"
        echo "   $BLOCKING_FAILURES blocking issues must be resolved before deployment"
        echo "   Review the detailed report: $REPORT_FILE"
        exit 1
    elif [ $FAILED_CHECKS -gt 0 ]; then
        log_warning "⚠️ QUALITY GATES PASSED WITH WARNINGS"
        echo "   $FAILED_CHECKS non-blocking issues should be addressed"
        echo "   Review the detailed report: $REPORT_FILE"
        exit 0
    else
        log_success "✅ ALL QUALITY GATES PASSED"
        echo "   Code meets all quality standards and is ready for deployment"
        echo "   Detailed report available: $REPORT_FILE"
        exit 0
    fi
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [gate_type]"
    echo ""
    echo "Gate types:"
    echo "  typescript     - TypeScript quality checks"
    echo "  eslint         - ESLint code quality checks"
    echo "  test           - Test quality and coverage checks"
    echo "  security       - Security vulnerability checks"
    echo "  performance    - Performance and optimization checks"
    echo "  documentation  - Documentation quality checks"
    echo "  deployment     - Deployment readiness checks"
    echo "  all            - Run all quality gates (default)"
    echo ""
    echo "Output files:"
    echo "  $RESULTS_FILE  - JSON results"
    echo "  $REPORT_FILE   - HTML report"
    echo ""
    exit 0
fi

# Run the quality checks
main "$@"