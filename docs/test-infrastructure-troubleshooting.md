# 🔧 VonkFi Test Infrastructure Troubleshooting Guide

<div align="center">

![Troubleshooting Guide](https://img.shields.io/badge/Guide-Troubleshooting-red)
![Status](https://img.shields.io/badge/Status-Enterprise%20Ready-brightgreen)
![Last Updated](https://img.shields.io/badge/Updated-2025--07--02-blue)

**🎯 Your comprehensive guide to diagnosing and resolving test infrastructure issues**

</div>

## 🚀 Quick Access Navigation

<table>
<tr>
<td align="center">🚨<br><strong><a href="#emergency-triage-protocol">EMERGENCY</a></strong><br>Critical failures</td>
<td align="center">⚡<br><strong><a href="#quick-diagnostics">QUICK START</a></strong><br>30-second checks</td>
<td align="center">🗄️<br><strong><a href="#database-connection-problems">DATABASE</a></strong><br>Connection issues</td>
<td align="center">🐳<br><strong><a href="#container-issues">CONTAINERS</a></strong><br>Docker problems</td>
</tr>
<tr>
<td align="center">⚡<br><strong><a href="#performance-issues">PERFORMANCE</a></strong><br>Speed optimization</td>
<td align="center">🔌<br><strong><a href="#connection-pool-issues">POOL MGMT</a></strong><br>Connection pools</td>
<td align="center">🛠️<br><strong><a href="#diagnostic-commands">DIAGNOSTICS</a></strong><br>Command reference</td>
<td align="center">📋<br><strong><a href="#troubleshooting-flowcharts">FLOWCHARTS</a></strong><br>Visual guides</td>
</tr>
</table>

---

## 📚 Table of Contents

### 🚨 **Critical Response**
1. [Emergency Triage Protocol](#emergency-triage-protocol) - **Use this first for critical issues**
2. [Quick Diagnostics](#quick-diagnostics) - **30-second health checks**
3. [Emergency Procedures](#emergency-procedures) - **When everything is broken**

### 🔍 **Issue Categories**
4. [Common Issues & Solutions](#common-issues--solutions) - **Frequently encountered problems**
5. [Database Connection Problems](#database-connection-problems) - **DB connectivity & performance**
6. [Container Issues](#container-issues) - **Docker & containerization**
7. [Test Execution Failures](#test-execution-failures) - **Test running problems**
8. [Performance Issues](#performance-issues) - **Speed & resource optimization**
9. [Connection Pool Issues](#connection-pool-issues) - **Pool management & leaks**
10. [Recovery System Problems](#recovery-system-problems) - **Circuit breakers & recovery**

### 🛠️ **Tools & References**
11. [Diagnostic Commands](#diagnostic-commands) - **Command-line tools**
12. [Troubleshooting Flowcharts](#troubleshooting-flowcharts) - **Visual decision trees**
13. [Related Documentation](#related-documentation) - **Cross-references**
14. [Getting Help](#getting-help) - **Escalation & support**

---

## 🚨 Emergency Triage Protocol

> **⚠️ START HERE for critical issues that are blocking development**

### Step 1: Immediate Assessment (30 seconds)

**Run this command first:**
```bash
# One-line emergency status check
./scripts/health-diagnostics.sh quick || echo "💥 CRITICAL: Health check failed"
```

**Quick visual check:**
```bash
# Container status
docker-compose -f docker-compose.test.yml ps

# Basic connectivity
npm run test:smoke 2>&1 | head -10
```

### Step 2: Severity Classification (30 seconds)

<details>
<summary><strong>🔥 SEVERITY 1: Complete Failure</strong></summary>

**Indicators:**
- No containers running
- All tests failing
- Database completely inaccessible
- Multiple system components down

**Response:** ➡️ [Emergency System Reset](#emergency-system-reset)

</details>

<details>
<summary><strong>⚠️ SEVERITY 2: Major Degradation</strong></summary>

**Indicators:**
- Some containers running but unhealthy
- >50% test failure rate
- Intermittent database connectivity
- Significant performance degradation

**Response:** ➡️ [Component Recovery](#component-recovery-workflow)

</details>

<details>
<summary><strong>💛 SEVERITY 3: Minor Issues</strong></summary>

**Indicators:**
- Individual test failures
- Slow performance but functional
- Occasional connection errors
- Warning-level alerts

**Response:** ➡️ [Standard Troubleshooting](#common-issues--solutions)

</details>

### Step 3: Quick Action Reference

| Issue Type | Immediate Action | Time to Fix |
|------------|------------------|-------------|
| 🚨 **No containers running** | `./scripts/emergency-response.sh` | 2-5 min |
| 🗄️ **Database unreachable** | `docker-compose -f docker-compose.test.yml restart postgres-test` | 1-2 min |
| 🧪 **All tests failing** | `npm run test:smoke` → Check logs | 30 sec |
| ⚡ **Very slow performance** | Check [Performance Issues](#performance-issues) | 5-10 min |
| 🔌 **Connection pool exhausted** | [Pool Recovery](#connection-pool-recovery) | 2-3 min |

---

## ⚡ Quick Diagnostics

> **🎯 Goal:** Get system status in under 30 seconds

### 🚀 One-Command Health Check

<div align="center">

**👉 START HERE: Run this first for any issue**

</div>

```bash
# 🎯 PRIMARY DIAGNOSTIC COMMAND
./scripts/health-diagnostics.sh quick
```

<details>
<summary><strong>Expected Output ✓</strong></summary>

```bash
🎯 [HEALTH] Quick health diagnostics...
✅ [SUCCESS] System health: OK
✅ [SUCCESS] Containers: 2/2 running
✅ [SUCCESS] Database: Connected (45ms)
✅ [SUCCESS] Test infrastructure: Ready
🎉 Overall status: HEALTHY
```

</details>

<details>
<summary><strong>Troubleshooting Failed Health Check ❌</strong></summary>

If the health check fails, you'll see specific error details:

```bash
# Example error output
❌ [ERROR] Database: Connection timeout
⚠️ [WARNING] Container postgres-test: Not responding
🚨 Overall status: UNHEALTHY

# Recommended actions will be displayed
💡 Try: docker-compose -f docker-compose.test.yml restart postgres-test
```

**Next Steps:**
1. Follow the displayed recommendations
2. If no recommendations, check [Database Issues](#database-connection-problems)
3. For container issues, see [Container Troubleshooting](#container-issues)

</details>

### 🔍 Detailed System Status

<div align="center">

**Use these commands when you need more detailed information**

</div>

#### 🐳 Container Health Assessment
```bash
# Quick container overview with status indicators
docker-compose -f docker-compose.test.yml ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}\t{{.Health}}"

# Detailed container health (includes resource usage)
docker stats $(docker-compose -f docker-compose.test.yml ps -q) --no-stream
```

<details>
<summary><strong>Understanding Container Status 🔍</strong></summary>

| Status | Meaning | Action Needed |
|--------|---------|---------------|
| `Up (healthy)` | ✅ Perfect | None |
| `Up` | ⚠️ Running but no health check | Check logs |
| `Up (unhealthy)` | ❌ Failing health checks | Restart container |
| `Exited (0)` | ❌ Stopped normally | Start container |
| `Exited (1)` | 🚨 Crashed | Check logs, restart |
| `Restarting` | 🔄 Continuously failing | Check configuration |

</details>

#### 🗄️ Database Connectivity Check
```bash
# 🔥 Fast connectivity test
docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test

# 🔍 Detailed database status
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT 
  'Connection Status' as check_type, 
  'Connected' as status,
  current_database() as database_name,
  current_user as connected_user,
  version() as db_version;
"
```

<details>
<summary><strong>Database Connection Troubleshooting 🔧</strong></summary>

**Common Connection Errors:**

| Error Message | Likely Cause | Quick Fix |
|---------------|--------------|----------|
| `connection refused` | Container not running | `docker-compose -f docker-compose.test.yml up -d postgres-test` |
| `timeout` | Container starting up | Wait 30 seconds, try again |
| `authentication failed` | Wrong credentials | Check environment variables |
| `database does not exist` | DB not initialized | Run `./run-tests.sh --reset-db` |

</details>

#### 🧪 Test Infrastructure Validation
```bash
# 🎯 Smoke test - verifies end-to-end functionality
npm run test:smoke

# 📉 Connection pool metrics (if available)
if [ -f "test-results/test-results.json" ]; then
  jq '.poolMetrics // "No pool metrics available"' test-results/test-results.json
fi
```

### 📈 Status Dashboard

<div align="center">

**👀 Visual status overview**

</div>

```bash
# 📈 Generate status dashboard
printf "\n🎯 VonkFi Test Infrastructure Status Dashboard\n"
printf "${'='*60}\n"
printf "📅 $(date)\n\n"

# System overview
printf "🐳 CONTAINERS:\n"
docker-compose -f docker-compose.test.yml ps --format "  {{.Service}}: {{.Status}}"

printf "\n🗄️ DATABASE:\n"
if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test >/dev/null 2>&1; then
  printf "  PostgreSQL: ✅ Connected\n"
else
  printf "  PostgreSQL: ❌ Disconnected\n"
fi

printf "\n🧪 TESTS:\n"
if npm run test:smoke >/dev/null 2>&1; then
  printf "  Infrastructure: ✅ Ready\n"
else
  printf "  Infrastructure: ❌ Not Ready\n"
fi

printf "\n📈 PERFORMANCE:\n"
printf "  Memory: $(free -h 2>/dev/null | awk 'NR==2{print $3"/"$2}' || echo 'N/A')\n"
printf "  Disk: $(df -h . | awk 'NR==2{print $5}' || echo 'N/A') used\n"
```

## Common Issues & Solutions

### Issue: "Database failed to become ready after X attempts"

**Symptoms:**
- Tests fail to start
- Container appears running but connection fails
- Error in `run-tests.sh` during database readiness check

**Diagnosis:**
```bash
# Check container status
docker-compose -f docker-compose.test.yml ps postgres-test

# Check container logs
docker-compose -f docker-compose.test.yml logs postgres-test --tail=50

# Test manual connection
docker-compose -f docker-compose.test.yml exec postgres-test psql -U test -d vonkfi_test -c "SELECT 1;"
```

**Solutions:**
1. **Container startup timing:**
   ```bash
   # Increase wait time in run-tests.sh
   # Edit run-tests.sh line ~25: sleep 10  # Instead of sleep 5
   ```

2. **Port conflicts:**
   ```bash
   # Check if port 5434 is in use
   lsof -i :5434
   # Kill conflicting processes or change port in docker-compose.test.yml
   ```

3. **Memory constraints:**
   ```bash
   # Check system memory
   free -h
   # Restart Docker if memory is low
   docker system prune -f
   ```

4. **Database corruption:**
   ```bash
   # Reset containers and volumes
   docker-compose -f docker-compose.test.yml down -v
   docker-compose -f docker-compose.test.yml up -d
   ```

### Issue: "Smoke tests failed! Infrastructure is not ready"

**Symptoms:**
- Infrastructure validation fails before main tests
- Connectivity issues detected

**Diagnosis:**
```bash
# Run smoke tests in verbose mode
npx vitest run test/smoke-tests.ts --reporter=verbose

# Check health check results
npx tsx -e "
import { performQuickHealthCheck } from './test/utils/comprehensive-health-check.js';
const result = await performQuickHealthCheck({
  host: 'localhost', port: 5434, database: 'vonkfi_test', user: 'test', password: 'test'
});
console.log(JSON.stringify(result, null, 2));
"
```

**Solutions:**
1. **Database connectivity:**
   ```bash
   # Restart database container
   docker-compose -f docker-compose.test.yml restart postgres-test
   
   # Wait for full initialization
   sleep 30
   ```

2. **Schema issues:**
   ```bash
   # Force migration reset
   rm -rf node_modules/.drizzle
   npm run db:generate
   npm run db:migrate
   ```

3. **Permission issues:**
   ```bash
   # Fix container permissions
   docker-compose -f docker-compose.test.yml down
   sudo chown -R $USER:$USER .
   docker-compose -f docker-compose.test.yml up -d
   ```

## Container Issues

### Container Won't Start

**Check Docker status:**
```bash
docker --version
docker system info
docker system df
```

**Common fixes:**
```bash
# Restart Docker daemon
sudo systemctl restart docker  # Linux
# or restart Docker Desktop

# Clean up resources
docker system prune -a -f
docker volume prune -f
```

### Container Memory Issues

**Symptoms:**
- Containers randomly stop
- Out of memory errors
- Poor performance

**Diagnosis:**
```bash
# Monitor container resources
docker stats $(docker-compose -f docker-compose.test.yml ps -q)

# Check system resources
free -h
df -h
```

**Solutions:**
```bash
# Increase container memory limits in docker-compose.test.yml
# Add under postgres-test service:
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M
```

### Network Connectivity Issues

**Port binding problems:**
```bash
# Check port availability
netstat -tulpn | grep :5434

# Find process using port
lsof -i :5434

# Kill conflicting process
sudo kill -9 <PID>
```

**Network isolation:**
```bash
# Reset Docker networks
docker network prune -f
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up -d
```

## Database Connection Problems

### Connection Pool Exhaustion

**Symptoms:**
- "Pool exhausted" errors
- Long wait times for connections
- Tests timing out

**Diagnosis:**
```bash
# Check active connections
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT count(*), state FROM pg_stat_activity 
WHERE datname = 'vonkfi_test' 
GROUP BY state;
"

# Monitor pool metrics
tail -f logs/test-pool-metrics.log
```

**Solutions:**
1. **Increase pool size:**
   ```typescript
   // In test/setup.ts
   const poolManager = new TestConnectionPoolManager({
     max: 30, // Increase from 20
     min: 5,  // Increase from 2
     // ... other options
   });
   ```

2. **Force release stuck connections:**
   ```bash
   # Kill long-running queries
   psql postgresql://test:test@localhost:5434/vonkfi_test -c "
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE datname = 'vonkfi_test' 
   AND state = 'idle in transaction' 
   AND query_start < now() - interval '5 minutes';
   "
   ```

### Database Lock Issues

**Symptoms:**
- Tests hang indefinitely
- Deadlock errors
- "Database is locked" messages

**Diagnosis:**
```bash
# Check for locks
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
JOIN pg_catalog.pg_stat_activity blocking_activity 
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;
"
```

**Solutions:**
```bash
# Kill blocking queries
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT pg_terminate_backend(<blocking_pid>);
"

# Reset all connections
./run-tests.sh --reset-db
```

## Test Execution Failures

### Migration Failures

**Symptoms:**
- "Migration failed" errors
- Schema inconsistencies
- Missing tables

**Diagnosis:**
```bash
# Check migration status
npx drizzle-kit studio
# or
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 5;
"
```

**Solutions:**
```bash
# Reset migrations
dropdb -h localhost -p 5434 -U test vonkfi_test
createdb -h localhost -p 5434 -U test vonkfi_test
npm run db:migrate

# Force regenerate migrations
rm -rf migrations/
npm run db:generate
npm run db:migrate
```

### Test Data Cleanup Issues

**Symptoms:**
- Test data persists between runs
- Foreign key constraint errors
- Unexpected test failures

**Solutions:**
```bash
# Manual cleanup
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
TRUNCATE TABLE transaction_hashes, transfer_recommendations, goals, 
transactions, accounts, import_history, users, categories 
RESTART IDENTITY CASCADE;
"

# Verify cleanup
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT 'users', count(*) FROM users
UNION ALL SELECT 'accounts', count(*) FROM accounts
UNION ALL SELECT 'transactions', count(*) FROM transactions;
"
```

### Test Environment Variables

**Missing or incorrect environment variables:**
```bash
# Check test environment
cat .env.test

# Set required variables
export NODE_ENV=test
export TEST_DATABASE_URL=postgresql://test:test@localhost:5434/vonkfi_test
export DISABLE_AUTH_FOR_TESTS=true
```

## Performance Issues

### Slow Test Execution

**Symptoms:**
- Tests take longer than 2-3 minutes total
- Individual tests timeout
- High CPU/memory usage

**Diagnosis:**
```bash
# Profile test performance
npm run test:coverage -- --reporter=verbose --run

# Monitor system resources during tests
top -p $(pgrep -f "vitest\|node")
```

**Solutions:**
1. **Optimize parallel execution:**
   ```bash
   # Edit vitest.config.ts
   export default defineConfig({
     test: {
       pool: 'threads',
       poolOptions: {
         threads: {
           maxThreads: 4,  // Adjust based on CPU cores
           minThreads: 2,
         }
       }
     }
   });
   ```

2. **Reduce test data size:**
   ```bash
   # Use minimal test datasets
   # Avoid large imports in test files
   ```

3. **Database performance:**
   ```sql
   -- Add indexes for test queries
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_transactions_date 
   ON transactions(date);
   ```

### Memory Leaks

**Symptoms:**
- Memory usage continuously increases
- Tests eventually crash
- System becomes unresponsive

**Diagnosis:**
```bash
# Monitor memory during tests
watch -n 1 'ps aux | grep -E "(vitest|node)" | grep -v grep'

# Check for memory leaks in test files
npm run test:coverage -- --reporter=verbose | grep -i "heap\|memory"
```

**Solutions:**
```typescript
// Add to test files that may leak
afterEach(() => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// In test/setup.ts, add memory monitoring
setInterval(() => {
  const used = process.memoryUsage();
  if (used.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
    console.warn('High memory usage detected:', used);
  }
}, 30000);
```

## Connection Pool Issues

### Pool Manager Failures

**Symptoms:**
- "Pool manager destroyed" errors
- Connection acquisition timeouts
- Inconsistent pool state

**Diagnosis:**
```typescript
// Add diagnostic logging in test files
import { poolManager } from './test/setup';

console.log('Pool metrics:', poolManager?.getMetrics());
console.log('Active leases:', poolManager?.getActiveLeases());
```

**Solutions:**
```typescript
// In test/setup.ts - increase timeouts
const poolManager = new TestConnectionPoolManager({
  connectionTimeoutMillis: 10000, // Increase from 5000
  maxLeaseTime: 60000,            // Increase from 30000
  healthCheckInterval: 10000,     // Increase from 5000
});
```

### Recovery System Issues

**Symptoms:**
- Circuit breaker stuck open
- Recovery loops
- Emergency mode activation

**Diagnosis:**
```bash
# Check recovery status
npx tsx -e "
import { getRecoverySystem } from './test/utils/connection-recovery-system.js';
const recovery = getRecoverySystem();
if (recovery) {
  console.log(recovery.generateRecoveryReport());
} else {
  console.log('Recovery system not initialized');
}
"
```

**Solutions:**
```bash
# Reset recovery system
rm -f logs/recovery-*.log
# Restart test infrastructure
./run-tests.sh --force-reset
```

## Diagnostic Commands

### System Information
```bash
# Get comprehensive system info
echo "=== System Information ==="
uname -a
docker version
docker-compose version
node --version
npm --version

echo "=== Resource Usage ==="
free -h
df -h
docker system df

echo "=== Network Ports ==="
netstat -tulpn | grep -E "(5434|6381)"

echo "=== Container Status ==="
docker-compose -f docker-compose.test.yml ps
```

### Database Diagnostics
```bash
# Database connection test
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT 
  'Database Size' as metric, 
  pg_size_pretty(pg_database_size('vonkfi_test')) as value
UNION ALL
SELECT 
  'Active Connections', 
  count(*)::text 
FROM pg_stat_activity 
WHERE datname = 'vonkfi_test'
UNION ALL
SELECT 
  'Idle Connections', 
  count(*)::text 
FROM pg_stat_activity 
WHERE datname = 'vonkfi_test' AND state = 'idle';
"
```

### Test Infrastructure Health
```bash
# Comprehensive health check
npx tsx scripts/health-check.js || npx tsx -e "
import { ComprehensiveHealthCheck } from './test/utils/comprehensive-health-check.js';
const health = new ComprehensiveHealthCheck({
  dbConfig: {
    host: 'localhost',
    port: 5434,
    database: 'vonkfi_test',
    user: 'test',
    password: 'test'
  }
});
const result = await health.performHealthCheck();
console.log(JSON.stringify(result, null, 2));
"
```

### Performance Monitoring
```bash
# Monitor test performance
time npm run test:run > test-performance.log 2>&1

# Monitor resource usage during tests
( npm run test:run & echo $! > test.pid )
while kill -0 $(cat test.pid) 2>/dev/null; do
  echo "$(date): $(ps -o pid,pcpu,pmem,time,comm -p $(cat test.pid))"
  sleep 5
done
rm test.pid
```

## Emergency Procedures

### Complete Infrastructure Reset
```bash
#!/bin/bash
echo "🚨 EMERGENCY RESET - This will destroy all test data!"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" = "yes" ]; then
  # Stop all processes
  pkill -f "vitest\|playwright"
  
  # Destroy containers and volumes
  docker-compose -f docker-compose.test.yml down -v
  docker system prune -f
  
  # Clean test artifacts
  rm -rf test-results/ coverage/ logs/
  rm -rf node_modules/.drizzle
  
  # Reinstall dependencies
  npm ci
  
  # Regenerate migrations
  npm run db:generate
  
  # Start fresh
  docker-compose -f docker-compose.test.yml up -d
  sleep 30
  
  # Verify setup
  npm run test:smoke
  
  echo "✅ Emergency reset completed"
else
  echo "❌ Reset cancelled"
fi
```

### Recovery from Corrupted State
```bash
#!/bin/bash
echo "🔧 RECOVERY PROCEDURE"

# Step 1: Diagnose the issue
echo "Step 1: Running diagnostics..."
./scripts/health-check.sh

# Step 2: Attempt graceful restart
echo "Step 2: Graceful restart..."
docker-compose -f docker-compose.test.yml restart

# Wait for services
sleep 30

# Step 3: Test connectivity
echo "Step 3: Testing connectivity..."
if docker-compose -f docker-compose.test.yml exec postgres-test pg_isready -U test -d vonkfi_test; then
  echo "✅ Database is responding"
else
  echo "❌ Database not responding - escalating to reset"
  # Execute emergency reset procedure
  ./emergency-reset.sh
fi

# Step 4: Verify recovery
echo "Step 4: Verifying recovery..."
npm run test:smoke

echo "🎉 Recovery procedure completed"
```

### Monitoring and Alerting Setup
```bash
# Set up continuous monitoring (run in background)
#!/bin/bash
MONITORING_LOG="logs/continuous-monitoring.log"
mkdir -p logs

while true; do
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  
  # Check container health
  container_status=$(docker-compose -f docker-compose.test.yml ps --services --filter "status=running" | wc -l)
  
  # Check database connectivity
  if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test >/dev/null 2>&1; then
    db_status="UP"
  else
    db_status="DOWN"
  fi
  
  # Log status
  echo "$timestamp - Containers: $container_status/2, DB: $db_status" >> "$MONITORING_LOG"
  
  # Alert on issues
  if [ "$container_status" -lt 2 ] || [ "$db_status" = "DOWN" ]; then
    echo "🚨 ALERT: Infrastructure issues detected at $timestamp" | tee -a "$MONITORING_LOG"
    # Add notification logic here (email, Slack, etc.)
  fi
  
  sleep 60  # Check every minute
done
```

## Getting Help

### Log Locations
- Test execution: `./test-results/test-results.json`
- Container logs: `docker-compose -f docker-compose.test.yml logs`
- Pool metrics: `./logs/pool-metrics.log`
- Recovery logs: `./logs/recovery-*.log`
- CI monitoring: `./monitoring/ci-monitoring.log`

### Debug Mode
```bash
# Run tests in debug mode
DEBUG=vitest* npm run test:run

# Run with verbose logging
npm run test:run -- --reporter=verbose

# Enable pool debugging
POOL_DEBUG=true npm run test:run
```

### Support Checklist
When requesting support, provide:
- [ ] Output of diagnostic commands
- [ ] Container status and logs
- [ ] Recent test results
- [ ] System specifications
- [ ] Error messages and stack traces
- [ ] Steps to reproduce the issue

Remember: Most issues can be resolved with a targeted restart or cleanup. Always try the gentlest solution first before escalating to complete resets.

---

## 📊 Troubleshooting Flowcharts

### 🔄 Main Troubleshooting Decision Tree

```mermaid
graph TD
    A[🚨 Infrastructure Issue Detected] --> B{Run health-diagnostics.sh quick}
    
    B -->|✅ All Green| C[✅ System Healthy<br/>Check individual test failures]
    B -->|❌ Red Status| D{Identify Failed Component}
    
    D -->|🐳 Container| E[Container Issues Path]
    D -->|🗄️ Database| F[Database Issues Path]
    D -->|⚡ Performance| G[Performance Issues Path]
    D -->|🔌 Network| H[Network Issues Path]
    
    E --> E1[Check container status<br/>docker-compose ps]
    E1 --> E2{Container Running?}
    E2 -->|No| E3[Start: docker-compose up -d]
    E2 -->|Yes, Unhealthy| E4[Restart: docker-compose restart]
    E2 -->|Yes, Healthy| E5[Check logs: docker-compose logs]
    
    F --> F1[Test connection<br/>pg_isready]
    F1 --> F2{Connected?}
    F2 -->|No| F3[Check container status]
    F2 -->|Yes, Slow| F4[Check pool utilization]
    F2 -->|Yes, Errors| F5[Check logs for deadlocks]
    
    G --> G1[Check system resources<br/>free, df, top]
    G1 --> G2{Resource Issue?}
    G2 -->|Memory| G3[Clean up processes<br/>Reduce pool size]
    G2 -->|CPU| G4[Reduce concurrency<br/>Check for loops]
    G2 -->|Disk| G5[Clean logs and cache<br/>docker system prune]
    
    H --> H1[Check port availability<br/>netstat -tulpn]
    H1 --> H2{Port Conflicts?}
    H2 -->|Yes| H3[Kill conflicting process<br/>or change port]
    H2 -->|No| H4[Check network connectivity<br/>ping, telnet]
```

### 🗄️ Database Troubleshooting Flow

```mermaid
graph TD
    A[🗄️ Database Issue] --> B[Run: docker-compose exec postgres-test pg_isready]
    
    B -->|✅ Ready| C{Performance Issue?}
    B -->|❌ Not Ready| D{Container Status?}
    
    D -->|Not Running| E[Start Container<br/>docker-compose up -d postgres-test]
    D -->|Running| F[Check Logs<br/>docker-compose logs postgres-test]
    
    F --> F1{Common Errors in Logs?}
    F1 -->|Port in use| F2[Change port or kill process]
    F1 -->|Permission denied| F3[Fix permissions<br/>chown -R]
    F1 -->|Out of memory| F4[Increase container memory]
    F1 -->|Disk space| F5[Clean up space<br/>docker system prune]
    
    C -->|Slow queries| G[Check active connections<br/>SELECT * FROM pg_stat_activity]
    C -->|Connection errors| H[Check pool utilization]
    C -->|Timeouts| I[Increase timeout settings]
    
    G --> G1{Too many connections?}
    G1 -->|Yes| G2[Kill long-running queries<br/>Reduce pool size]
    G1 -->|No| G3[Add indexes<br/>Optimize queries]
    
    H --> H1{Pool exhausted?}
    H1 -->|Yes| H2[Increase pool size<br/>Fix connection leaks]
    H1 -->|No| H3[Check connection configuration]
```

### 🐳 Container Troubleshooting Flow

```mermaid
graph TD
    A[🐳 Container Issue] --> B[Run: docker-compose ps]
    
    B --> C{Container Status?}
    
    C -->|Up (healthy)| D[✅ Container OK<br/>Check application logs]
    C -->|Up (unhealthy)| E[Check Health Check<br/>docker-compose logs]
    C -->|Up (no health check)| F[Manual health verification]
    C -->|Exited| G[Check exit code and restart]
    C -->|Restarting| H[Check for restart loop]
    C -->|Not found| I[Container not defined<br/>Check docker-compose.yml]
    
    E --> E1{Health Check Failing?}
    E1 -->|Database connectivity| E2[Check database connection<br/>from container]
    E1 -->|Resource limits| E3[Check memory/CPU limits<br/>Increase if needed]
    E1 -->|Service not ready| E4[Increase startup time<br/>or health check interval]
    
    G --> G1{Exit Code?}
    G1 -->|0| G2[Normal exit<br/>Restart: docker-compose up -d]
    G1 -->|1| G3[Error exit<br/>Check logs: docker-compose logs]
    G1 -->|125| G4[Docker error<br/>Check configuration]
    G1 -->|126| G5[Permission error<br/>Check file permissions]
    G1 -->|137| G6[Killed (OOM?)<br/>Increase memory limit]
    
    H --> H1[Check logs for error pattern<br/>docker-compose logs --tail=50]
    H1 --> H2{Restart Cause?}
    H2 -->|Memory issues| H3[Increase memory limits]
    H2 -->|Configuration error| H4[Fix configuration<br/>Recreate container]
    H2 -->|Port conflicts| H5[Check port availability<br/>Change ports if needed]
```

---

## 📚 Related Documentation

### 🔗 Quick Navigation Links

| Document | Use Case | Key Sections |
|----------|----------|--------------|
| **[Performance Tuning Guide](./test-performance-tuning.md)** | Slow execution times | [Database Optimization](./test-performance-tuning.md#database-optimization), [Container Performance](./test-performance-tuning.md#container-performance) |
| **[Emergency Recovery Runbook](./emergency-recovery-runbook.md)** | Critical system failures | [Emergency Procedures](./emergency-recovery-runbook.md#emergency-procedures), [Recovery Workflows](./emergency-recovery-runbook.md#recovery-workflows) |
| **[Documentation Hub](./README.md)** | General guidance | [Architecture Overview](./README.md#test-infrastructure-architecture), [Quick Start Guide](./README.md#quick-start-guide) |

### 📊 Cross-Reference Matrix

| Issue Type | Troubleshooting | Performance | Emergency | Health Monitoring |
|------------|----------------|-------------|-----------|-------------------|
| **Database slow** | ✅ This Guide | ✅ [Performance Guide](./test-performance-tuning.md#database-optimization) | - | ✅ [Health Reports](../test/utils/automated-health-reporting.ts) |
| **Container crash** | ✅ This Guide | ✅ [Container Perf](./test-performance-tuning.md#container-performance) | ✅ [Emergency](./emergency-recovery-runbook.md) | ✅ [Diagnostics](../scripts/health-diagnostics.sh) |
| **Complete failure** | ✅ This Guide | - | ✅ [Emergency](./emergency-recovery-runbook.md#emergency-procedures) | - |
| **Memory issues** | ✅ This Guide | ✅ [Resource Tuning](./test-performance-tuning.md#memory-optimization) | ✅ [Recovery](./emergency-recovery-runbook.md#recovery-workflows) | ✅ [Monitoring](../test/utils/automated-health-reporting.ts) |

### 🛠️ Tool References

| Tool | Command | Purpose | Documentation |
|------|---------|---------|---------------|
| **Health Diagnostics** | `./scripts/health-diagnostics.sh quick` | System status check | [Usage Guide](#quick-diagnostics) |
| **Smoke Tests** | `npm run test:smoke` | Basic functionality | [Test Execution](#test-execution-failures) |
| **Container Management** | `docker-compose -f docker-compose.test.yml ps` | Container status | [Container Issues](#container-issues) |
| **Database Tools** | `psql postgresql://test:test@localhost:5434/vonkfi_test` | Database access | [Database Problems](#database-connection-problems) |
| **Emergency Response** | `./scripts/emergency-response.sh` | Automated recovery | [Emergency Procedures](#emergency-procedures) |

---

## 🆘 Getting Help

### 📞 Support Escalation Path

1. **Self-Service (0-15 minutes)**
   - Follow this troubleshooting guide
   - Check [FAQ section](#common-issues--solutions)
   - Run diagnostic commands

2. **Team Support (15-60 minutes)**
   - Share diagnostic output with team
   - Check team chat for similar issues
   - Review recent changes in git history

3. **Expert Support (1+ hour)**
   - Escalate to senior engineers
   - Include full diagnostic report
   - Document issue for future reference

### 📋 Support Request Template

When asking for help, include this information:

```markdown
## 🚨 Infrastructure Issue Report

**Environment:** [Local/CI/Staging/Production]
**Date/Time:** [When issue started]
**Impact Level:** [High/Medium/Low]

### 🔍 Issue Description
[Brief description of the problem]

### 📊 Diagnostic Information
```bash
# Health check output
./scripts/health-diagnostics.sh quick

# Container status
docker-compose -f docker-compose.test.yml ps

# Recent logs (last 20 lines)
docker-compose -f docker-compose.test.yml logs --tail=20
```

### 🔄 Steps Attempted
- [ ] Ran health diagnostics
- [ ] Checked container status
- [ ] Restarted problematic services
- [ ] Reviewed logs for errors
- [ ] [Other steps taken]

### 🎯 Expected vs Actual Behavior
**Expected:** [What should happen]
**Actual:** [What actually happens]

### 📎 Additional Context
[Any relevant context, recent changes, etc.]
```

### 🔗 Emergency Contacts

| Role | Contact Method | Response Time |
|------|----------------|---------------|
| **On-Call Engineer** | [Slack/Phone] | < 15 minutes |
| **Senior QA** | [Slack/Email] | < 30 minutes |
| **DevOps Team** | [Slack/Email] | < 1 hour |
| **Engineering Manager** | [Email/Phone] | < 2 hours |

### 💡 Self-Help Resources

- **Logs Location**: `./logs/` directory
- **Health Reports**: `./logs/health-reports/`
- **Test Results**: `./test-results/`
- **Container Logs**: `docker-compose -f docker-compose.test.yml logs`
- **Database Access**: `psql postgresql://test:test@localhost:5434/vonkfi_test`

---

**Remember**: Most issues can be resolved with targeted restarts or cleanup. Always try the gentlest solution first before escalating to complete resets. When in doubt, ask for help - it's better to get guidance than to accidentally make things worse.