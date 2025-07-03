#!/bin/bash

# CI/CD Monitoring and Observability Script
# Collects metrics, monitors performance, and sends alerts

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
MONITORING_DIR="./monitoring"
METRICS_FILE="$MONITORING_DIR/metrics.json"
LOGS_FILE="$MONITORING_DIR/ci-monitoring.log"
ALERTS_FILE="$MONITORING_DIR/alerts.json"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOGS_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOGS_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOGS_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOGS_FILE"
}

log_metric() {
    echo -e "${PURPLE}[METRIC]${NC} $1" | tee -a "$LOGS_FILE"
}

# Initialize monitoring
init_monitoring() {
    log_info "🚀 Initializing CI/CD monitoring..."
    
    # Create monitoring directory
    mkdir -p "$MONITORING_DIR"
    
    # Initialize metrics file
    cat > "$METRICS_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "ci_platform": "${CI_PLATFORM:-unknown}",
  "pipeline_id": "${CI_PIPELINE_ID:-${GITHUB_RUN_ID:-unknown}}",
  "branch": "${CI_COMMIT_REF_NAME:-${GITHUB_REF_NAME:-unknown}}",
  "commit": "${CI_COMMIT_SHA:-${GITHUB_SHA:-unknown}}",
  "build": {},
  "test": {},
  "security": {},
  "performance": {},
  "quality": {}
}
EOF
    
    log_success "Monitoring initialized"
}

# Collect system metrics
collect_system_metrics() {
    log_info "📊 Collecting system metrics..."
    
    # Memory usage
    if command -v free >/dev/null 2>&1; then
        MEMORY_TOTAL=$(free -m | awk 'NR==2{print $2}')
        MEMORY_USED=$(free -m | awk 'NR==2{print $3}')
        MEMORY_PERCENT=$(( MEMORY_USED * 100 / MEMORY_TOTAL ))
        
        log_metric "Memory usage: ${MEMORY_USED}MB/${MEMORY_TOTAL}MB (${MEMORY_PERCENT}%)"
        
        # Update metrics file
        jq --arg mem_used "$MEMORY_USED" \
           --arg mem_total "$MEMORY_TOTAL" \
           --arg mem_percent "$MEMORY_PERCENT" \
           '.performance.memory = {
              "used_mb": ($mem_used | tonumber),
              "total_mb": ($mem_total | tonumber),
              "usage_percent": ($mem_percent | tonumber)
            }' "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # CPU usage
    if command -v top >/dev/null 2>&1; then
        CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
        log_metric "CPU usage: ${CPU_USAGE}%"
        
        jq --arg cpu "$CPU_USAGE" \
           '.performance.cpu_usage_percent = ($cpu | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # Disk usage
    if command -v df >/dev/null 2>&1; then
        DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
        log_metric "Disk usage: ${DISK_USAGE}%"
        
        jq --arg disk "$DISK_USAGE" \
           '.performance.disk_usage_percent = ($disk | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # Load average (Linux/Mac)
    if command -v uptime >/dev/null 2>&1; then
        LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
        log_metric "Load average: $LOAD_AVG"
        
        jq --arg load "$LOAD_AVG" \
           '.performance.load_average = ($load | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
}

# Monitor build metrics
monitor_build() {
    log_info "🏗️ Monitoring build metrics..."
    
    BUILD_START_TIME=$(date +%s)
    
    # Build size monitoring
    if [ -d "dist" ] || [ -d "build" ]; then
        BUILD_SIZE=$(du -sm dist build 2>/dev/null | awk '{sum += $1} END {print sum}' || echo "0")
        log_metric "Build size: ${BUILD_SIZE}MB"
        
        jq --arg size "$BUILD_SIZE" \
           '.build.size_mb = ($size | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # Dependency count
    if [ -f "package.json" ]; then
        DEPS_COUNT=$(jq '.dependencies | length' package.json 2>/dev/null || echo "0")
        DEV_DEPS_COUNT=$(jq '.devDependencies | length' package.json 2>/dev/null || echo "0")
        TOTAL_DEPS=$((DEPS_COUNT + DEV_DEPS_COUNT))
        
        log_metric "Dependencies: ${DEPS_COUNT} production, ${DEV_DEPS_COUNT} dev (total: ${TOTAL_DEPS})"
        
        jq --arg prod "$DEPS_COUNT" \
           --arg dev "$DEV_DEPS_COUNT" \
           --arg total "$TOTAL_DEPS" \
           '.build.dependencies = {
              "production": ($prod | tonumber),
              "development": ($dev | tonumber),
              "total": ($total | tonumber)
            }' "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # Node modules size
    if [ -d "node_modules" ]; then
        NODE_MODULES_SIZE=$(du -sm node_modules 2>/dev/null | awk '{print $1}' || echo "0")
        log_metric "Node modules size: ${NODE_MODULES_SIZE}MB"
        
        jq --arg nm_size "$NODE_MODULES_SIZE" \
           '.build.node_modules_size_mb = ($nm_size | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
}

# Monitor test metrics
monitor_tests() {
    log_info "🧪 Monitoring test metrics..."
    
    # Test results analysis
    if [ -d "test-results" ]; then
        # Count test files
        TEST_FILES_COUNT=$(find test-results -name "*.json" | wc -l)
        log_metric "Test result files: $TEST_FILES_COUNT"
        
        # Analyze test results
        TOTAL_TESTS=0
        PASSED_TESTS=0
        FAILED_TESTS=0
        SKIPPED_TESTS=0
        
        for result_file in test-results/*.json; do
            if [ -f "$result_file" ]; then
                # Extract test counts (format may vary)
                if command -v jq >/dev/null 2>&1; then
                    file_total=$(jq '.numTotalTests // .testResults[].numTotalTests // 0' "$result_file" 2>/dev/null | head -1)
                    file_passed=$(jq '.numPassedTests // .testResults[].numPassedTests // 0' "$result_file" 2>/dev/null | head -1)
                    file_failed=$(jq '.numFailedTests // .testResults[].numFailedTests // 0' "$result_file" 2>/dev/null | head -1)
                    file_skipped=$(jq '.numPendingTests // .testResults[].numPendingTests // 0' "$result_file" 2>/dev/null | head -1)
                    
                    TOTAL_TESTS=$((TOTAL_TESTS + ${file_total:-0}))
                    PASSED_TESTS=$((PASSED_TESTS + ${file_passed:-0}))
                    FAILED_TESTS=$((FAILED_TESTS + ${file_failed:-0}))
                    SKIPPED_TESTS=$((SKIPPED_TESTS + ${file_skipped:-0}))
                fi
            fi
        done
        
        # Calculate success rate
        if [ $TOTAL_TESTS -gt 0 ]; then
            SUCCESS_RATE=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
        else
            SUCCESS_RATE=0
        fi
        
        log_metric "Tests: $PASSED_TESTS passed, $FAILED_TESTS failed, $SKIPPED_TESTS skipped (${SUCCESS_RATE}% success rate)"
        
        jq --arg total "$TOTAL_TESTS" \
           --arg passed "$PASSED_TESTS" \
           --arg failed "$FAILED_TESTS" \
           --arg skipped "$SKIPPED_TESTS" \
           --arg success_rate "$SUCCESS_RATE" \
           '.test = {
              "total": ($total | tonumber),
              "passed": ($passed | tonumber),
              "failed": ($failed | tonumber),
              "skipped": ($skipped | tonumber),
              "success_rate": ($success_rate | tonumber)
            }' "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
    
    # Coverage analysis
    if [ -f "coverage/coverage-summary.json" ]; then
        COVERAGE_PERCENT=$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
        log_metric "Test coverage: ${COVERAGE_PERCENT}%"
        
        jq --arg coverage "$COVERAGE_PERCENT" \
           '.test.coverage_percent = ($coverage | tonumber)' \
           "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
    fi
}

# Monitor security metrics
monitor_security() {
    log_info "🔒 Monitoring security metrics..."
    
    # Vulnerability counts
    CRITICAL_VULNS=0
    HIGH_VULNS=0
    MODERATE_VULNS=0
    SECRETS_FOUND=0
    
    # Check npm audit results
    if [ -f "security-reports/npm-audit.json" ]; then
        if command -v jq >/dev/null 2>&1; then
            CRITICAL_VULNS=$(jq '.metadata.vulnerabilities.critical // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
            HIGH_VULNS=$(jq '.metadata.vulnerabilities.high // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
            MODERATE_VULNS=$(jq '.metadata.vulnerabilities.moderate // 0' security-reports/npm-audit.json 2>/dev/null || echo "0")
        fi
    fi
    
    # Check secret scan results
    if [ -f "security-reports/secret-scan.txt" ]; then
        SECRETS_FOUND=$(grep -c "potential secret" security-reports/secret-scan.txt 2>/dev/null || echo "0")
    fi
    
    log_metric "Security: $CRITICAL_VULNS critical, $HIGH_VULNS high, $MODERATE_VULNS moderate vulns; $SECRETS_FOUND secrets"
    
    # Calculate security score (100 - penalties)
    SECURITY_SCORE=100
    SECURITY_SCORE=$((SECURITY_SCORE - CRITICAL_VULNS * 20))  # -20 per critical
    SECURITY_SCORE=$((SECURITY_SCORE - HIGH_VULNS * 10))     # -10 per high
    SECURITY_SCORE=$((SECURITY_SCORE - MODERATE_VULNS * 2))  # -2 per moderate
    SECURITY_SCORE=$((SECURITY_SCORE - SECRETS_FOUND * 15))  # -15 per secret
    
    # Ensure score doesn't go below 0
    if [ $SECURITY_SCORE -lt 0 ]; then
        SECURITY_SCORE=0
    fi
    
    jq --arg critical "$CRITICAL_VULNS" \
       --arg high "$HIGH_VULNS" \
       --arg moderate "$MODERATE_VULNS" \
       --arg secrets "$SECRETS_FOUND" \
       --arg score "$SECURITY_SCORE" \
       '.security = {
          "vulnerabilities": {
            "critical": ($critical | tonumber),
            "high": ($high | tonumber),
            "moderate": ($moderate | tonumber)
          },
          "secrets_found": ($secrets | tonumber),
          "security_score": ($score | tonumber)
        }' "$METRICS_FILE" > tmp.json && mv tmp.json "$METRICS_FILE"
}

# Check thresholds and generate alerts
check_thresholds() {
    log_info "🚨 Checking thresholds and generating alerts..."
    
    ALERTS=()
    
    # Read current metrics
    if [ -f "$METRICS_FILE" ] && command -v jq >/dev/null 2>&1; then
        # Memory threshold check
        MEMORY_PERCENT=$(jq '.performance.memory.usage_percent // 0' "$METRICS_FILE")
        if [ "${MEMORY_PERCENT%.*}" -gt 90 ]; then
            ALERTS+=("CRITICAL: Memory usage at ${MEMORY_PERCENT}%")
        elif [ "${MEMORY_PERCENT%.*}" -gt 80 ]; then
            ALERTS+=("WARNING: Memory usage at ${MEMORY_PERCENT}%")
        fi
        
        # Test failure check
        FAILED_TESTS=$(jq '.test.failed // 0' "$METRICS_FILE")
        if [ "$FAILED_TESTS" -gt 0 ]; then
            ALERTS+=("WARNING: $FAILED_TESTS test(s) failed")
        fi
        
        # Security threshold check
        CRITICAL_VULNS=$(jq '.security.vulnerabilities.critical // 0' "$METRICS_FILE")
        SECRETS_FOUND=$(jq '.security.secrets_found // 0' "$METRICS_FILE")
        
        if [ "$CRITICAL_VULNS" -gt 0 ]; then
            ALERTS+=("CRITICAL: $CRITICAL_VULNS critical security vulnerabilities found")
        fi
        
        if [ "$SECRETS_FOUND" -gt 0 ]; then
            ALERTS+=("CRITICAL: $SECRETS_FOUND potential secrets found in code")
        fi
        
        # Coverage threshold check
        COVERAGE=$(jq '.test.coverage_percent // 0' "$METRICS_FILE")
        if [ "${COVERAGE%.*}" -lt 70 ]; then
            ALERTS+=("WARNING: Test coverage below 70% (${COVERAGE}%)")
        fi
    fi
    
    # Write alerts to file
    if [ ${#ALERTS[@]} -gt 0 ]; then
        {
            echo "{"
            echo "  \"timestamp\": \"$(date -Iseconds)\","
            echo "  \"alerts\": ["
            for i in "${!ALERTS[@]}"; do
                echo "    \"${ALERTS[$i]}\""
                if [ $i -lt $((${#ALERTS[@]} - 1)) ]; then
                    echo ","
                fi
            done
            echo "  ]"
            echo "}"
        } > "$ALERTS_FILE"
        
        log_warning "Generated ${#ALERTS[@]} alert(s)"
        for alert in "${ALERTS[@]}"; do
            log_warning "🚨 $alert"
        done
    else
        log_success "No alerts generated - all metrics within thresholds"
    fi
}

# Send notifications
send_notifications() {
    log_info "📢 Sending notifications..."
    
    if [ -f "$ALERTS_FILE" ] && [ -s "$ALERTS_FILE" ]; then
        # Send to Slack if webhook is configured
        if [ -n "$SLACK_WEBHOOK_URL" ]; then
            ALERT_COUNT=$(jq '.alerts | length' "$ALERTS_FILE")
            ALERT_TEXT=$(jq -r '.alerts | join("\\n")' "$ALERTS_FILE")
            
            curl -X POST -H 'Content-type: application/json' \
                --data "{
                  \"text\": \"🚨 VonkFi CI/CD Alert ($ALERT_COUNT alerts)\\n\`\`\`\\n$ALERT_TEXT\\n\`\`\`\",
                  \"channel\": \"#ci-cd-alerts\",
                  \"username\": \"CI Monitor Bot\"
                }" \
                "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 && \
                log_success "Slack notification sent" || \
                log_warning "Failed to send Slack notification"
        fi
        
        # Send email if configured
        if [ -n "$EMAIL_RECIPIENTS" ] && command -v mail >/dev/null 2>&1; then
            ALERT_TEXT=$(jq -r '.alerts | join("\\n")' "$ALERTS_FILE")
            echo "CI/CD Pipeline Alerts:\\n\\n$ALERT_TEXT" | \
                mail -s "VonkFi CI/CD Alerts" "$EMAIL_RECIPIENTS" && \
                log_success "Email notification sent" || \
                log_warning "Failed to send email notification"
        fi
    else
        log_info "No alerts to send"
    fi
}

# Generate HTML report
generate_report() {
    log_info "📊 Generating monitoring report..."
    
    REPORT_FILE="$MONITORING_DIR/monitoring-report.html"
    
    cat > "$REPORT_FILE" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>VonkFi CI/CD Monitoring Report</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { text-align: center; color: #333; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .section { margin: 30px 0; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .metric-card { background: #f8f9fa; border-radius: 6px; padding: 20px; border-left: 4px solid #007bff; }
        .metric-card.warning { border-left-color: #ffc107; background: #fff3cd; }
        .metric-card.critical { border-left-color: #dc3545; background: #ffe6e6; }
        .metric-card.success { border-left-color: #28a745; background: #d4edda; }
        .metric-title { font-weight: bold; margin-bottom: 10px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .alerts { background: #ffe6e6; border: 1px solid #dc3545; border-radius: 6px; padding: 20px; margin: 20px 0; }
        .no-alerts { background: #d4edda; border: 1px solid #28a745; border-radius: 6px; padding: 20px; margin: 20px 0; }
        .timestamp { color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 VonkFi CI/CD Monitoring Report</h1>
            <p class="timestamp">Generated: <span id="timestamp"></span></p>
        </div>
        
        <div class="section">
            <h2>Performance Metrics</h2>
            <div class="metric-grid">
                <div class="metric-card" id="memory-card">
                    <div class="metric-title">Memory Usage</div>
                    <div class="metric-value" id="memory-usage">-</div>
                </div>
                <div class="metric-card" id="cpu-card">
                    <div class="metric-title">CPU Usage</div>
                    <div class="metric-value" id="cpu-usage">-</div>
                </div>
                <div class="metric-card" id="disk-card">
                    <div class="metric-title">Disk Usage</div>
                    <div class="metric-value" id="disk-usage">-</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Test Metrics</h2>
            <div class="metric-grid">
                <div class="metric-card" id="test-success-card">
                    <div class="metric-title">Test Success Rate</div>
                    <div class="metric-value" id="test-success">-</div>
                </div>
                <div class="metric-card" id="coverage-card">
                    <div class="metric-title">Test Coverage</div>
                    <div class="metric-value" id="test-coverage">-</div>
                </div>
                <div class="metric-card" id="test-count-card">
                    <div class="metric-title">Total Tests</div>
                    <div class="metric-value" id="test-count">-</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Security Metrics</h2>
            <div class="metric-grid">
                <div class="metric-card" id="security-score-card">
                    <div class="metric-title">Security Score</div>
                    <div class="metric-value" id="security-score">-</div>
                </div>
                <div class="metric-card" id="vulns-card">
                    <div class="metric-title">Critical Vulnerabilities</div>
                    <div class="metric-value" id="critical-vulns">-</div>
                </div>
                <div class="metric-card" id="secrets-card">
                    <div class="metric-title">Secrets Found</div>
                    <div class="metric-value" id="secrets-found">-</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Alerts</h2>
            <div id="alerts-section"></div>
        </div>
    </div>
    
    <script>
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        
        // Load metrics (this would be populated by the monitoring script)
        fetch('./metrics.json')
            .then(response => response.json())
            .then(data => {
                // Update performance metrics
                if (data.performance && data.performance.memory) {
                    document.getElementById('memory-usage').textContent = data.performance.memory.usage_percent + '%';
                    const memCard = document.getElementById('memory-card');
                    if (data.performance.memory.usage_percent > 90) memCard.classList.add('critical');
                    else if (data.performance.memory.usage_percent > 80) memCard.classList.add('warning');
                    else memCard.classList.add('success');
                }
                
                if (data.performance && data.performance.cpu_usage_percent) {
                    document.getElementById('cpu-usage').textContent = data.performance.cpu_usage_percent + '%';
                }
                
                if (data.performance && data.performance.disk_usage_percent) {
                    document.getElementById('disk-usage').textContent = data.performance.disk_usage_percent + '%';
                }
                
                // Update test metrics
                if (data.test) {
                    if (data.test.success_rate !== undefined) {
                        document.getElementById('test-success').textContent = data.test.success_rate + '%';
                        const testCard = document.getElementById('test-success-card');
                        if (data.test.success_rate < 90) testCard.classList.add('warning');
                        else testCard.classList.add('success');
                    }
                    
                    if (data.test.coverage_percent !== undefined) {
                        document.getElementById('test-coverage').textContent = data.test.coverage_percent + '%';
                        const covCard = document.getElementById('coverage-card');
                        if (data.test.coverage_percent < 70) covCard.classList.add('warning');
                        else if (data.test.coverage_percent >= 80) covCard.classList.add('success');
                    }
                    
                    if (data.test.total !== undefined) {
                        document.getElementById('test-count').textContent = data.test.total;
                    }
                }
                
                // Update security metrics
                if (data.security) {
                    if (data.security.security_score !== undefined) {
                        document.getElementById('security-score').textContent = data.security.security_score;
                        const secCard = document.getElementById('security-score-card');
                        if (data.security.security_score < 70) secCard.classList.add('critical');
                        else if (data.security.security_score < 85) secCard.classList.add('warning');
                        else secCard.classList.add('success');
                    }
                    
                    if (data.security.vulnerabilities && data.security.vulnerabilities.critical !== undefined) {
                        document.getElementById('critical-vulns').textContent = data.security.vulnerabilities.critical;
                        const vulnCard = document.getElementById('vulns-card');
                        if (data.security.vulnerabilities.critical > 0) vulnCard.classList.add('critical');
                        else vulnCard.classList.add('success');
                    }
                    
                    if (data.security.secrets_found !== undefined) {
                        document.getElementById('secrets-found').textContent = data.security.secrets_found;
                        const secretsCard = document.getElementById('secrets-card');
                        if (data.security.secrets_found > 0) secretsCard.classList.add('critical');
                        else secretsCard.classList.add('success');
                    }
                }
            })
            .catch(error => console.error('Error loading metrics:', error));
        
        // Load alerts
        fetch('./alerts.json')
            .then(response => response.json())
            .then(data => {
                const alertsSection = document.getElementById('alerts-section');
                if (data.alerts && data.alerts.length > 0) {
                    alertsSection.innerHTML = '<div class="alerts"><h3>🚨 Active Alerts</h3><ul>' + 
                        data.alerts.map(alert => '<li>' + alert + '</li>').join('') + '</ul></div>';
                } else {
                    alertsSection.innerHTML = '<div class="no-alerts"><h3>✅ No Active Alerts</h3><p>All systems operating normally.</p></div>';
                }
            })
            .catch(error => {
                document.getElementById('alerts-section').innerHTML = '<div class="no-alerts"><h3>✅ No Active Alerts</h3><p>All systems operating normally.</p></div>';
            });
    </script>
</body>
</html>
EOF
    
    log_success "Monitoring report generated: $REPORT_FILE"
}

# Cleanup old files
cleanup_old_files() {
    log_info "🧹 Cleaning up old monitoring files..."
    
    # Clean up old log files (keep last 7 days)
    find "$MONITORING_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Clean up old metric files (keep last 30 days)
    find "$MONITORING_DIR" -name "metrics-*.json" -mtime +30 -delete 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# Main execution
main() {
    local action=${1:-"all"}
    
    case "$action" in
        "init")
            init_monitoring
            ;;
        "collect")
            init_monitoring
            collect_system_metrics
            monitor_build
            monitor_tests
            monitor_security
            ;;
        "check")
            check_thresholds
            ;;
        "notify")
            send_notifications
            ;;
        "report")
            generate_report
            ;;
        "cleanup")
            cleanup_old_files
            ;;
        "all"|*)
            init_monitoring
            collect_system_metrics
            monitor_build
            monitor_tests
            monitor_security
            check_thresholds
            send_notifications
            generate_report
            cleanup_old_files
            ;;
    esac
    
    log_success "🎉 CI/CD monitoring completed successfully"
}

# Script usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [action]"
    echo ""
    echo "Actions:"
    echo "  init      - Initialize monitoring only"
    echo "  collect   - Collect metrics only"
    echo "  check     - Check thresholds only"
    echo "  notify    - Send notifications only"
    echo "  report    - Generate report only"
    echo "  cleanup   - Cleanup old files only"
    echo "  all       - Run all actions (default)"
    echo ""
    echo "Environment variables:"
    echo "  SLACK_WEBHOOK_URL    - Slack webhook for notifications"
    echo "  EMAIL_RECIPIENTS     - Email addresses for notifications"
    echo "  CI_PLATFORM          - CI platform identifier"
    exit 0
fi

# Run the monitoring
main "$@"