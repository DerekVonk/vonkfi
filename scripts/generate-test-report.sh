#!/bin/bash

# Comprehensive Test Report Generator
# Generates consolidated test reports from all test types

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
REPORT_DIR="./test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$REPORT_DIR/test-report-$TIMESTAMP.html"
JSON_REPORT="$REPORT_DIR/test-report-$TIMESTAMP.json"
SUMMARY_FILE="$REPORT_DIR/test-summary-$TIMESTAMP.txt"

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

log_header() {
    echo -e "${PURPLE}[REPORT]${NC} $1"
}

# Create report directory
create_report_directory() {
    log_info "Creating test report directory..."
    mkdir -p "$REPORT_DIR"
    mkdir -p "$REPORT_DIR/assets"
    mkdir -p "$REPORT_DIR/coverage"
    mkdir -p "$REPORT_DIR/artifacts"
}

# Function to check if a file exists and is not empty
check_file() {
    local file_path="$1"
    if [ -f "$file_path" ] && [ -s "$file_path" ]; then
        return 0
    else
        return 1
    fi
}

# Function to extract test metrics from JSON reports
extract_test_metrics() {
    local json_file="$1"
    local test_type="$2"
    
    if check_file "$json_file"; then
        log_info "Extracting metrics from $test_type: $json_file"
        
        # Extract basic metrics using jq
        local total_tests=$(jq -r '.numTotalTests // 0' "$json_file" 2>/dev/null || echo "0")
        local passed_tests=$(jq -r '.numPassedTests // 0' "$json_file" 2>/dev/null || echo "0")
        local failed_tests=$(jq -r '.numFailedTests // 0' "$json_file" 2>/dev/null || echo "0")
        local duration=$(jq -r '.testResults[0].perfStats.runtime // 0' "$json_file" 2>/dev/null || echo "0")
        
        echo "$test_type,$total_tests,$passed_tests,$failed_tests,$duration"
    else
        log_warning "Test results file not found: $json_file"
        echo "$test_type,0,0,0,0"
    fi
}

# Function to extract coverage metrics
extract_coverage_metrics() {
    local coverage_file="./coverage/coverage-summary.json"
    
    if check_file "$coverage_file"; then
        log_info "Extracting coverage metrics..."
        
        local lines_pct=$(jq -r '.total.lines.pct // 0' "$coverage_file" 2>/dev/null || echo "0")
        local functions_pct=$(jq -r '.total.functions.pct // 0' "$coverage_file" 2>/dev/null || echo "0")
        local branches_pct=$(jq -r '.total.branches.pct // 0' "$coverage_file" 2>/dev/null || echo "0")
        local statements_pct=$(jq -r '.total.statements.pct // 0' "$coverage_file" 2>/dev/null || echo "0")
        
        echo "$lines_pct,$functions_pct,$branches_pct,$statements_pct"
    else
        log_warning "Coverage summary not found: $coverage_file"
        echo "0,0,0,0"
    fi
}

# Function to collect test artifacts
collect_test_artifacts() {
    log_info "Collecting test artifacts..."
    
    # Copy coverage reports
    if [ -d "./coverage" ]; then
        cp -r ./coverage/* "$REPORT_DIR/coverage/" 2>/dev/null || true
        log_success "Coverage reports copied"
    fi
    
    # Copy test result files
    if [ -d "./test-results" ]; then
        cp -r ./test-results/* "$REPORT_DIR/artifacts/" 2>/dev/null || true
        log_success "Test result files copied"
    fi
    
    # Copy Playwright reports
    if [ -d "./playwright-report" ]; then
        cp -r ./playwright-report/* "$REPORT_DIR/artifacts/playwright/" 2>/dev/null || true
        log_success "Playwright reports copied"
    fi
    
    # Copy performance reports
    if [ -d "./performance-results" ]; then
        cp -r ./performance-results/* "$REPORT_DIR/artifacts/performance/" 2>/dev/null || true
        log_success "Performance reports copied"
    fi
}

# Function to generate HTML report
generate_html_report() {
    log_info "Generating HTML test report..."
    
    # Collect test metrics
    local unit_metrics=$(extract_test_metrics "./test-results/test-results.json" "Unit Tests")
    local integration_metrics=$(extract_test_metrics "./test-results/integration-results.json" "Integration Tests")
    local e2e_metrics=$(extract_test_metrics "./test-results/results.json" "E2E Tests")
    local performance_metrics=$(extract_test_metrics "./test-results/performance-results.json" "Performance Tests")
    
    # Extract coverage metrics
    local coverage_metrics=$(extract_coverage_metrics)
    
    # Generate HTML report
    cat > "$REPORT_FILE" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VonkFi Test Report - $TIMESTAMP</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .metric-card h3 {
            margin: 0 0 10px 0;
            color: #495057;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .warning { color: #ffc107; }
        .info { color: #17a2b8; }
        .test-section {
            padding: 30px;
            border-bottom: 1px solid #e9ecef;
        }
        .test-section h2 {
            color: #495057;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .test-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .test-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .coverage-bar {
            width: 100%;
            height: 20px;
            background: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .coverage-fill {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #20c997);
            transition: width 0.3s ease;
        }
        .links-section {
            padding: 30px;
            background: #f8f9fa;
        }
        .links-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }
        .link-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-decoration: none;
            color: #495057;
            border: 1px solid #dee2e6;
            transition: all 0.3s ease;
        }
        .link-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            text-decoration: none;
            color: #495057;
        }
        .footer {
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 0.9em;
        }
        @media (max-width: 768px) {
            .summary, .test-grid, .links-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 VonkFi Test Report</h1>
            <p>Generated on $(date '+%Y-%m-%d %H:%M:%S')</p>
        </div>
        
        <div class="summary">
            <div class="metric-card">
                <h3>📊 Total Tests</h3>
                <div class="metric-value info">$(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $2+$7+$12}')</div>
            </div>
            <div class="metric-card">
                <h3>✅ Passed</h3>
                <div class="metric-value passed">$(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $3+$8+$13}')</div>
            </div>
            <div class="metric-card">
                <h3>❌ Failed</h3>
                <div class="metric-value failed">$(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $4+$9+$14}')</div>
            </div>
            <div class="metric-card">
                <h3>📈 Coverage</h3>
                <div class="metric-value info">$(echo "$coverage_metrics" | cut -d',' -f1)%</div>
            </div>
        </div>
        
        <div class="test-section">
            <h2>🧪 Test Results</h2>
            <div class="test-grid">
                <div class="test-item">
                    <h4>Unit Tests</h4>
                    <p>Total: $(echo "$unit_metrics" | cut -d',' -f2)</p>
                    <p>Passed: <span class="passed">$(echo "$unit_metrics" | cut -d',' -f3)</span></p>
                    <p>Failed: <span class="failed">$(echo "$unit_metrics" | cut -d',' -f4)</span></p>
                </div>
                <div class="test-item">
                    <h4>Integration Tests</h4>
                    <p>Total: $(echo "$integration_metrics" | cut -d',' -f2)</p>
                    <p>Passed: <span class="passed">$(echo "$integration_metrics" | cut -d',' -f3)</span></p>
                    <p>Failed: <span class="failed">$(echo "$integration_metrics" | cut -d',' -f4)</span></p>
                </div>
                <div class="test-item">
                    <h4>E2E Tests</h4>
                    <p>Total: $(echo "$e2e_metrics" | cut -d',' -f2)</p>
                    <p>Passed: <span class="passed">$(echo "$e2e_metrics" | cut -d',' -f3)</span></p>
                    <p>Failed: <span class="failed">$(echo "$e2e_metrics" | cut -d',' -f4)</span></p>
                </div>
                <div class="test-item">
                    <h4>Performance Tests</h4>
                    <p>Total: $(echo "$performance_metrics" | cut -d',' -f2)</p>
                    <p>Passed: <span class="passed">$(echo "$performance_metrics" | cut -d',' -f3)</span></p>
                    <p>Failed: <span class="failed">$(echo "$performance_metrics" | cut -d',' -f4)</span></p>
                </div>
            </div>
        </div>
        
        <div class="test-section">
            <h2>📊 Coverage Report</h2>
            <div class="test-grid">
                <div class="test-item">
                    <h4>Lines</h4>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: $(echo "$coverage_metrics" | cut -d',' -f1)%"></div>
                    </div>
                    <p>$(echo "$coverage_metrics" | cut -d',' -f1)%</p>
                </div>
                <div class="test-item">
                    <h4>Functions</h4>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: $(echo "$coverage_metrics" | cut -d',' -f2)%"></div>
                    </div>
                    <p>$(echo "$coverage_metrics" | cut -d',' -f2)%</p>
                </div>
                <div class="test-item">
                    <h4>Branches</h4>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: $(echo "$coverage_metrics" | cut -d',' -f3)%"></div>
                    </div>
                    <p>$(echo "$coverage_metrics" | cut -d',' -f3)%</p>
                </div>
                <div class="test-item">
                    <h4>Statements</h4>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: $(echo "$coverage_metrics" | cut -d',' -f4)%"></div>
                    </div>
                    <p>$(echo "$coverage_metrics" | cut -d',' -f4)%</p>
                </div>
            </div>
        </div>
        
        <div class="links-section">
            <h2>🔗 Detailed Reports</h2>
            <div class="links-grid">
                <a href="./coverage/index.html" class="link-card">
                    <h4>📊 Coverage Report</h4>
                    <p>Detailed code coverage analysis</p>
                </a>
                <a href="./artifacts/junit.xml" class="link-card">
                    <h4>📋 JUnit Report</h4>
                    <p>XML test results for CI/CD integration</p>
                </a>
                <a href="./artifacts/playwright/index.html" class="link-card">
                    <h4>🎭 Playwright Report</h4>
                    <p>E2E test results with screenshots</p>
                </a>
                <a href="./artifacts/performance/" class="link-card">
                    <h4>⚡ Performance Report</h4>
                    <p>Load testing and performance metrics</p>
                </a>
            </div>
        </div>
        
        <div class="footer">
            <p>Report generated by VonkFi CI/CD Pipeline | $(date '+%Y-%m-%d %H:%M:%S')</p>
        </div>
    </div>
</body>
</html>
EOF

    log_success "HTML report generated: $REPORT_FILE"
}

# Function to generate JSON report
generate_json_report() {
    log_info "Generating JSON test report..."
    
    # Collect all metrics
    local unit_metrics=$(extract_test_metrics "./test-results/test-results.json" "Unit Tests")
    local integration_metrics=$(extract_test_metrics "./test-results/integration-results.json" "Integration Tests")
    local e2e_metrics=$(extract_test_metrics "./test-results/results.json" "E2E Tests")
    local performance_metrics=$(extract_test_metrics "./test-results/performance-results.json" "Performance Tests")
    local coverage_metrics=$(extract_coverage_metrics)
    
    # Generate JSON structure
    cat > "$JSON_REPORT" << EOF
{
  "timestamp": "$TIMESTAMP",
  "generated_at": "$(date -Iseconds)",
  "summary": {
    "total_tests": $(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $2+$7+$12}'),
    "passed_tests": $(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $3+$8+$13}'),
    "failed_tests": $(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' '{print $4+$9+$14}'),
    "success_rate": $(echo "$unit_metrics,$integration_metrics,$e2e_metrics" | awk -F',' 'BEGIN{total=0;passed=0} {total+=$2+$7+$12; passed+=$3+$8+$13} END{if(total>0) print passed/total*100; else print 0}')
  },
  "test_suites": {
    "unit": {
      "type": "$(echo "$unit_metrics" | cut -d',' -f1)",
      "total": $(echo "$unit_metrics" | cut -d',' -f2),
      "passed": $(echo "$unit_metrics" | cut -d',' -f3),
      "failed": $(echo "$unit_metrics" | cut -d',' -f4),
      "duration": $(echo "$unit_metrics" | cut -d',' -f5)
    },
    "integration": {
      "type": "$(echo "$integration_metrics" | cut -d',' -f1)",
      "total": $(echo "$integration_metrics" | cut -d',' -f2),
      "passed": $(echo "$integration_metrics" | cut -d',' -f3),
      "failed": $(echo "$integration_metrics" | cut -d',' -f4),
      "duration": $(echo "$integration_metrics" | cut -d',' -f5)
    },
    "e2e": {
      "type": "$(echo "$e2e_metrics" | cut -d',' -f1)",
      "total": $(echo "$e2e_metrics" | cut -d',' -f2),
      "passed": $(echo "$e2e_metrics" | cut -d',' -f3),
      "failed": $(echo "$e2e_metrics" | cut -d',' -f4),
      "duration": $(echo "$e2e_metrics" | cut -d',' -f5)
    },
    "performance": {
      "type": "$(echo "$performance_metrics" | cut -d',' -f1)",
      "total": $(echo "$performance_metrics" | cut -d',' -f2),
      "passed": $(echo "$performance_metrics" | cut -d',' -f3),
      "failed": $(echo "$performance_metrics" | cut -d',' -f4),
      "duration": $(echo "$performance_metrics" | cut -d',' -f5)
    }
  },
  "coverage": {
    "lines": $(echo "$coverage_metrics" | cut -d',' -f1),
    "functions": $(echo "$coverage_metrics" | cut -d',' -f2),
    "branches": $(echo "$coverage_metrics" | cut -d',' -f3),
    "statements": $(echo "$coverage_metrics" | cut -d',' -f4)
  },
  "artifacts": {
    "html_report": "$REPORT_FILE",
    "coverage_report": "./coverage/index.html",
    "junit_report": "./test-results/test-results.xml",
    "playwright_report": "./playwright-report/index.html"
  }
}
EOF

    log_success "JSON report generated: $JSON_REPORT"
}

# Function to generate text summary
generate_text_summary() {
    log_info "Generating text summary..."
    
    cat > "$SUMMARY_FILE" << EOF
📊 VonkFi Test Report Summary
Generated: $(date '+%Y-%m-%d %H:%M:%S')
================================================

🧪 Test Results:
$(extract_test_metrics "./test-results/test-results.json" "Unit Tests" | awk -F',' '{printf "  Unit Tests:        %d total, %d passed, %d failed\n", $2, $3, $4}')
$(extract_test_metrics "./test-results/integration-results.json" "Integration Tests" | awk -F',' '{printf "  Integration Tests: %d total, %d passed, %d failed\n", $2, $3, $4}')
$(extract_test_metrics "./test-results/results.json" "E2E Tests" | awk -F',' '{printf "  E2E Tests:         %d total, %d passed, %d failed\n", $2, $3, $4}')
$(extract_test_metrics "./test-results/performance-results.json" "Performance Tests" | awk -F',' '{printf "  Performance Tests: %d total, %d passed, %d failed\n", $2, $3, $4}')

📈 Coverage:
$(extract_coverage_metrics | awk -F',' '{printf "  Lines:       %.1f%%\n  Functions:   %.1f%%\n  Branches:    %.1f%%\n  Statements:  %.1f%%\n", $1, $2, $3, $4}')

📋 Reports Generated:
  HTML Report: $REPORT_FILE
  JSON Report: $JSON_REPORT
  
🔗 Additional Artifacts:
  Coverage Report: ./coverage/index.html
  JUnit XML: ./test-results/test-results.xml
  Playwright Report: ./playwright-report/index.html

================================================
EOF

    log_success "Text summary generated: $SUMMARY_FILE"
}

# Main execution
main() {
    log_header "🚀 Starting comprehensive test report generation..."
    
    # Check prerequisites
    if ! command -v jq > /dev/null 2>&1; then
        log_error "jq is required but not installed"
        exit 1
    fi
    
    # Create report structure
    create_report_directory
    
    # Collect artifacts
    collect_test_artifacts
    
    # Generate reports
    generate_html_report
    generate_json_report
    generate_text_summary
    
    # Display summary
    echo
    log_header "📊 Test Report Generation Complete!"
    echo
    log_success "Reports generated in: $REPORT_DIR"
    log_success "Main report: $REPORT_FILE"
    log_success "JSON data: $JSON_REPORT"
    log_success "Summary: $SUMMARY_FILE"
    echo
    log_info "To view the report, open: $REPORT_FILE"
    
    # Output the summary for CI
    if [ "$CI" = "true" ]; then
        echo
        log_header "📋 CI Summary:"
        cat "$SUMMARY_FILE"
    fi
}

# Run the script
main "$@"