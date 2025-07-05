#!/bin/bash

# CI Configuration Validation Script
# Validates CI/CD configuration files and test infrastructure

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

# Global variables
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Function to increment error count
increment_errors() {
    VALIDATION_ERRORS=$((VALIDATION_ERRORS + 1))
}

# Function to increment warning count
increment_warnings() {
    VALIDATION_WARNINGS=$((VALIDATION_WARNINGS + 1))
}

# Function to check if a file exists
check_file_exists() {
    local file_path="$1"
    local description="$2"
    
    if [ -f "$file_path" ]; then
        log_success "✅ $description found: $file_path"
        return 0
    else
        log_error "❌ $description missing: $file_path"
        increment_errors
        return 1
    fi
}

# Function to check if a directory exists
check_directory_exists() {
    local dir_path="$1"
    local description="$2"
    
    if [ -d "$dir_path" ]; then
        log_success "✅ $description found: $dir_path"
        return 0
    else
        log_error "❌ $description missing: $dir_path"
        increment_errors
        return 1
    fi
}

# Function to validate package.json
validate_package_json() {
    log_info "🔍 Validating package.json..."
    
    if ! check_file_exists "package.json" "Package configuration"; then
        return 1
    fi
    
    # Check for required scripts
    local required_scripts=(
        "test"
        "test:run"
        "test:coverage"
        "test:e2e"
        "build"
        "dev"
        "start"
    )
    
    for script in "${required_scripts[@]}"; do
        if jq -e ".scripts.\"$script\"" package.json > /dev/null 2>&1; then
            log_success "✅ Required script found: $script"
        else
            log_error "❌ Required script missing: $script"
            increment_errors
        fi
    done
    
    # Check for required dependencies
    local required_deps=(
        "vitest"
        "@playwright/test"
        "typescript"
    )
    
    for dep in "${required_deps[@]}"; do
        if jq -e ".dependencies.\"$dep\" or .devDependencies.\"$dep\"" package.json > /dev/null 2>&1; then
            log_success "✅ Required dependency found: $dep"
        else
            log_warning "⚠️ Required dependency missing: $dep"
            increment_warnings
        fi
    done
}

# Function to validate test configuration files
validate_test_configs() {
    log_info "🧪 Validating test configuration files..."
    
    # Check Vitest configuration
    if check_file_exists "vitest.config.ts" "Vitest configuration"; then
        # Try to load the config
        if npx vitest --config vitest.config.ts --run --reporter=json --outputFile=/tmp/vitest-config-check.json --testNamePattern="__NON_EXISTENT_TEST__" 2>/dev/null; then
            log_success "✅ Vitest configuration is valid"
        else
            exit_code=$?
            if [ $exit_code -eq 1 ]; then
                log_success "✅ Vitest configuration is valid (no matching tests)"
            else
                log_error "❌ Vitest configuration has errors"
                increment_errors
            fi
        fi
    fi
    
    # Check Playwright configuration
    if check_file_exists "playwright.config.ts" "Playwright configuration"; then
        # Try to load the config
        if npx playwright --version > /dev/null 2>&1; then
            log_success "✅ Playwright configuration is accessible"
        else
            log_error "❌ Playwright configuration has issues"
            increment_errors
        fi
    fi
    
    # Check test setup file
    check_file_exists "test/setup.ts" "Test setup file"
    
    # Check test directories
    check_directory_exists "test" "Test directory"
    check_directory_exists "test/e2e" "E2E test directory"
}

# Function to validate CI configuration files
validate_ci_configs() {
    log_info "🔧 Validating CI configuration files..."
    
    # Check GitHub Actions
    if [ -d ".github/workflows" ]; then
        log_success "✅ GitHub Actions directory found"
        
        # Check for main CI workflow
        if check_file_exists ".github/workflows/ci.yml" "GitHub Actions CI workflow"; then
            # Validate YAML syntax
            if command -v yamllint > /dev/null 2>&1; then
                if yamllint .github/workflows/ci.yml > /dev/null 2>&1; then
                    log_success "✅ GitHub Actions CI YAML is valid"
                else
                    log_warning "⚠️ GitHub Actions CI YAML has formatting issues"
                    increment_warnings
                fi
            else
                log_warning "⚠️ yamllint not available, skipping YAML validation"
                increment_warnings
            fi
        fi
    else
        log_warning "⚠️ GitHub Actions directory not found"
        increment_warnings
    fi
    
    # Check GitLab CI
    if check_file_exists ".gitlab-ci.yml" "GitLab CI configuration"; then
        # Validate YAML syntax
        if command -v yamllint > /dev/null 2>&1; then
            if yamllint .gitlab-ci.yml > /dev/null 2>&1; then
                log_success "✅ GitLab CI YAML is valid"
            else
                log_warning "⚠️ GitLab CI YAML has formatting issues"
                increment_warnings
            fi
        else
            log_warning "⚠️ yamllint not available, skipping YAML validation"
            increment_warnings
        fi
    fi
}

# Function to validate Docker configurations
validate_docker_configs() {
    log_info "🐳 Validating Docker configurations..."
    
    # Check Docker Compose files
    local docker_compose_files=(
        "docker-compose.yml"
        "docker-compose.test.yml"
        "docker-compose.dev.yml"
    )
    
    for compose_file in "${docker_compose_files[@]}"; do
        if [ -f "$compose_file" ]; then
            log_success "✅ Docker Compose file found: $compose_file"
            
            # Validate Docker Compose syntax
            if command -v docker-compose > /dev/null 2>&1; then
                if docker-compose -f "$compose_file" config > /dev/null 2>&1; then
                    log_success "✅ Docker Compose file is valid: $compose_file"
                else
                    log_error "❌ Docker Compose file has errors: $compose_file"
                    increment_errors
                fi
            else
                log_warning "⚠️ docker-compose not available, skipping validation"
                increment_warnings
            fi
        fi
    done
    
    # Check Dockerfile
    if check_file_exists "Dockerfile" "Dockerfile"; then
        # Basic Dockerfile validation
        if grep -q "FROM" Dockerfile && grep -q "WORKDIR" Dockerfile; then
            log_success "✅ Dockerfile has basic structure"
        else
            log_warning "⚠️ Dockerfile may be incomplete"
            increment_warnings
        fi
    fi
}

# Function to validate test scripts
validate_test_scripts() {
    log_info "📜 Validating test scripts..."
    
    # Check main test runner script
    if check_file_exists "run-tests.sh" "Main test runner script"; then
        # Check if script is executable
        if [ -x "run-tests.sh" ]; then
            log_success "✅ Test runner script is executable"
        else
            log_warning "⚠️ Test runner script is not executable"
            increment_warnings
        fi
        
        # Check script syntax
        if bash -n run-tests.sh > /dev/null 2>&1; then
            log_success "✅ Test runner script syntax is valid"
        else
            log_error "❌ Test runner script has syntax errors"
            increment_errors
        fi
    fi
    
    # Check additional scripts
    local script_files=(
        "scripts/smoke-tests.sh"
        "scripts/security-scan.sh"
        "scripts/post-deployment-check.sh"
    )
    
    for script_file in "${script_files[@]}"; do
        if [ -f "$script_file" ]; then
            log_success "✅ Script found: $script_file"
            
            # Check if script is executable
            if [ -x "$script_file" ]; then
                log_success "✅ Script is executable: $script_file"
            else
                log_warning "⚠️ Script is not executable: $script_file"
                increment_warnings
            fi
            
            # Check script syntax
            if bash -n "$script_file" > /dev/null 2>&1; then
                log_success "✅ Script syntax is valid: $script_file"
            else
                log_error "❌ Script has syntax errors: $script_file"
                increment_errors
            fi
        fi
    done
}

# Function to validate environment files
validate_environment_files() {
    log_info "🌍 Validating environment files..."
    
    # Check for environment example files
    local env_files=(
        ".env.test.example"
        ".env.integration.example"
        ".env.e2e.example"
        ".env.performance.example"
    )
    
    for env_file in "${env_files[@]}"; do
        if [ -f "$env_file" ]; then
            log_success "✅ Environment example file found: $env_file"
        else
            log_warning "⚠️ Environment example file missing: $env_file"
            increment_warnings
        fi
    done
    
    # Check that actual .env files are gitignored
    if [ -f ".gitignore" ]; then
        if grep -q "\.env$" .gitignore || grep -q "\.env\.local" .gitignore; then
            log_success "✅ Environment files are properly gitignored"
        else
            log_warning "⚠️ Environment files may not be properly gitignored"
            increment_warnings
        fi
    fi
}

# Function to validate CI-specific configurations
validate_ci_specific_configs() {
    log_info "⚙️ Validating CI-specific configurations..."
    
    # Check CI configuration directory
    if check_directory_exists "ci" "CI configuration directory"; then
        # Check for CI-specific files
        local ci_files=(
            "ci/audit-ci.json"
            "ci/eslint-security.config.js"
        )
        
        for ci_file in "${ci_files[@]}"; do
            if check_file_exists "$ci_file" "CI configuration file"; then
                # Validate JSON files
                if [[ "$ci_file" == *.json ]]; then
                    if jq . "$ci_file" > /dev/null 2>&1; then
                        log_success "✅ JSON file is valid: $ci_file"
                    else
                        log_error "❌ JSON file has syntax errors: $ci_file"
                        increment_errors
                    fi
                fi
                
                # Validate JS files
                if [[ "$ci_file" == *.js ]]; then
                    if node -c "$ci_file" > /dev/null 2>&1; then
                        log_success "✅ JavaScript file is valid: $ci_file"
                    else
                        log_error "❌ JavaScript file has syntax errors: $ci_file"
                        increment_errors
                    fi
                fi
            fi
        done
    fi
}

# Function to check for pre-commit hooks
validate_pre_commit_setup() {
    log_info "🪝 Validating pre-commit setup..."
    
    # Check for pre-commit configuration
    if [ -f ".pre-commit-config.yaml" ]; then
        log_success "✅ Pre-commit configuration found"
        
        # Validate YAML syntax
        if command -v yamllint > /dev/null 2>&1; then
            if yamllint .pre-commit-config.yaml > /dev/null 2>&1; then
                log_success "✅ Pre-commit configuration YAML is valid"
            else
                log_warning "⚠️ Pre-commit configuration YAML has formatting issues"
                increment_warnings
            fi
        fi
    else
        log_warning "⚠️ Pre-commit configuration not found"
        increment_warnings
    fi
    
    # Check for Husky setup
    if [ -d ".husky" ]; then
        log_success "✅ Husky directory found"
        
        # Check for common hooks
        local hooks=("pre-commit" "pre-push" "commit-msg")
        for hook in "${hooks[@]}"; do
            if [ -f ".husky/$hook" ]; then
                log_success "✅ Husky hook found: $hook"
            fi
        done
    fi
}

# Function to validate database migration setup
validate_migration_setup() {
    log_info "🗄️ Validating database migration setup..."
    
    # Check for migrations directory
    if check_directory_exists "migrations" "Database migrations directory"; then
        # Check for migration files
        if ls migrations/*.sql > /dev/null 2>&1; then
            log_success "✅ Migration files found"
        else
            log_warning "⚠️ No migration files found"
            increment_warnings
        fi
    fi
    
    # Check for drizzle configuration
    if check_file_exists "drizzle.config.ts" "Drizzle configuration"; then
        # Try to validate the config
        if npx drizzle-kit --help > /dev/null 2>&1; then
            log_success "✅ Drizzle kit is accessible"
        else
            log_warning "⚠️ Drizzle kit may not be properly configured"
            increment_warnings
        fi
    fi
}

# Function to run all validations
run_all_validations() {
    log_info "🚀 Starting CI/CD configuration validation..."
    echo "================================================="
    
    validate_package_json
    echo
    validate_test_configs
    echo
    validate_ci_configs
    echo
    validate_docker_configs
    echo
    validate_test_scripts
    echo
    validate_environment_files
    echo
    validate_ci_specific_configs
    echo
    validate_pre_commit_setup
    echo
    validate_migration_setup
    
    echo "================================================="
    
    # Summary
    if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
        log_success "🎉 All validations passed! CI/CD configuration is ready."
        return 0
    elif [ $VALIDATION_ERRORS -eq 0 ]; then
        log_warning "⚠️ Validation completed with $VALIDATION_WARNINGS warnings."
        echo "Consider addressing the warnings for optimal CI/CD performance."
        return 0
    else
        log_error "❌ Validation failed with $VALIDATION_ERRORS errors and $VALIDATION_WARNINGS warnings."
        echo "Please fix the errors before proceeding with CI/CD setup."
        return 1
    fi
}

# Main execution
main() {
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        log_error "❌ This script must be run from the project root directory"
        exit 1
    fi
    
    # Check for required tools
    local required_tools=("jq" "node" "npm")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" > /dev/null 2>&1; then
            log_error "❌ Required tool not found: $tool"
            exit 1
        fi
    done
    
    # Run validations
    if run_all_validations; then
        exit 0
    else
        exit 1
    fi
}

# Run the script
main "$@"