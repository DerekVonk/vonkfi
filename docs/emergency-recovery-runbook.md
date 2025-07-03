# 🚨 VonkFi Test Infrastructure Emergency Recovery Runbook

<div align="center">

![Emergency Runbook](https://img.shields.io/badge/Runbook-Emergency%20Recovery-red)
![Status](https://img.shields.io/badge/Status-Enterprise%20Ready-brightgreen)
![Response Time](https://img.shields.io/badge/Response-<15min-critical)
![Last Updated](https://img.shields.io/badge/Updated-2025--07--02-blue)

**🆘 Critical incident response and recovery procedures for test infrastructure**

</div>

## 🚨 **EMERGENCY QUICK ACCESS**

<div align="center">

### **🔥 CRITICAL SITUATION? START HERE**

</div>

<table>
<tr>
<td align="center">🚨<br><strong><a href="#immediate-triage-protocol">IMMEDIATE TRIAGE</a></strong><br>First 2 minutes</td>
<td align="center">🔥<br><strong><a href="#severity-1-emergency-procedures">SEVERITY 1</a></strong><br>Complete failure</td>
<td align="center">⚠️<br><strong><a href="#severity-2-recovery-procedures">SEVERITY 2</a></strong><br>Major degradation</td>
<td align="center">📞<br><strong><a href="#emergency-contacts">CONTACTS</a></strong><br>Get help now</td>
</tr>
</table>

---

## 🆘 Immediate Triage Protocol

> **⏱️ GOAL: Assess and classify within 2 minutes**

### Step 1: Emergency Assessment (30 seconds)

```bash
# Run this IMMEDIATELY
./scripts/health-diagnostics.sh quick
```

<details>
<summary><strong>🟢 If health check passes</strong></summary>

**System is functional** - Issue may be:
- Individual test failures
- Performance degradation
- Partial service issues

**Next Action:** [Standard Troubleshooting](./test-infrastructure-troubleshooting.md)

</details>

<details>
<summary><strong>🔴 If health check fails</strong></summary>

**System has critical issues** - Proceed to severity classification below

</details>

### Step 2: Severity Classification (30 seconds)

<div align="center">

**🎯 Choose your emergency response path:**

</div>

| Indicators | Severity | Response Time | Action |
|------------|----------|---------------|--------|
| 🔴 **No containers running**<br/>🔴 **Complete database failure**<br/>🔴 **All tests failing** | **SEVERITY 1** | **< 15 minutes** | 👉 [Emergency Procedures](#severity-1-emergency-procedures) |
| 🟡 **Some containers down**<br/>🟡 **Database connectivity issues**<br/>🟡 **>50% test failure rate** | **SEVERITY 2** | **< 30 minutes** | 👉 [Recovery Procedures](#severity-2-recovery-procedures) |
| 🟢 **Individual test failures**<br/>🟢 **Performance issues**<br/>🟢 **Warning-level alerts** | **SEVERITY 3** | **< 2 hours** | 👉 [Standard Troubleshooting](./test-infrastructure-troubleshooting.md) |

### Step 3: Incident Declaration (60 seconds)

```bash
# Log the incident immediately
echo "$(date): INCIDENT START - Severity X - $(whoami) responding" >> logs/incident-$(date +%Y%m%d-%H%M).log

# For Severity 1 & 2: Notify team immediately
# [Add your notification command here]
```

---

## 📚 Table of Contents

### 🚨 **Critical Response Procedures**
1. [Emergency Response Overview](#emergency-response-overview) - **Team roles & contacts**
2. [Severity Levels & Response](#severity-levels--response) - **Classification & timelines**
3. [Emergency Procedures](#emergency-procedures) - **Step-by-step recovery**
4. [Recovery Workflows](#recovery-workflows) - **Visual decision trees**

### 🔄 **Recovery & Rollback**
5. [Rollback Procedures](#rollback-procedures) - **Code, DB, config rollbacks**
6. [Communication Protocols](#communication-protocols) - **Stakeholder updates**
7. [Post-Incident Procedures](#post-incident-procedures) - **Documentation & learning**
8. [Prevention & Monitoring](#prevention--monitoring) - **Proactive measures**

---

## Emergency Response Overview

### 👥 Response Team Roles

<table>
<tr>
<th>Role</th>
<th>Primary Responsibilities</th>
<th>Secondary Responsibilities</th>
</tr>
<tr>
<td><strong>🎯 Incident Commander</strong></td>
<td>• Coordinates overall response<br/>• Makes critical decisions<br/>• Manages timeline & priorities</td>
<td>• Stakeholder communication<br/>• Resource allocation<br/>• Post-incident review</td>
</tr>
<tr>
<td><strong>🔧 Technical Lead</strong></td>
<td>• Executes recovery procedures<br/>• Diagnoses technical issues<br/>• Implements fixes</td>
<td>• Technical documentation<br/>• Tool execution<br/>• System validation</td>
</tr>
<tr>
<td><strong>📢 Communications Lead</strong></td>
<td>• Manages stakeholder updates<br/>• Coordinates notifications<br/>• Maintains communication log</td>
<td>• Documentation updates<br/>• Status page management<br/>• Media coordination</td>
</tr>
<tr>
<td><strong>🧠 Subject Matter Expert</strong></td>
<td>• Provides domain expertise<br/>• Guides technical decisions<br/>• Validates solutions</td>
<td>• Knowledge transfer<br/>• Best practice guidance<br/>• Risk assessment</td>
</tr>
</table>

### 📞 Emergency Contact Information

<div align="center">

**🚨 CRITICAL: Update these contacts for your organization**

</div>

<table>
<tr>
<th>Role</th>
<th>Primary Contact</th>
<th>Backup Contact</th>
<th>Escalation Time</th>
</tr>
<tr>
<td><strong>🚨 Primary On-Call</strong></td>
<td>📱 [Phone]<br/>📧 [Email]<br/>💬 [@slack-handle]</td>
<td>📱 [Backup Phone]<br/>📧 [Backup Email]</td>
<td><strong>0-15 minutes</strong></td>
</tr>
<tr>
<td><strong>⚡ Secondary On-Call</strong></td>
<td>📱 [Phone]<br/>📧 [Email]<br/>💬 [@slack-handle]</td>
<td>📱 [Backup Phone]<br/>📧 [Backup Email]</td>
<td><strong>15-30 minutes</strong></td>
</tr>
<tr>
<td><strong>👔 Engineering Manager</strong></td>
<td>📱 [Phone]<br/>📧 [Email]<br/>💬 [@slack-handle]</td>
<td>📱 [Backup Phone]<br/>📧 [Backup Email]</td>
<td><strong>30-60 minutes</strong></td>
</tr>
<tr>
<td><strong>🏗️ DevOps Lead</strong></td>
<td>📱 [Phone]<br/>📧 [Email]<br/>💬 [@slack-handle]</td>
<td>📱 [Backup Phone]<br/>📧 [Backup Email]</td>
<td><strong>As needed</strong></td>
</tr>
</table>

### 📱 Emergency Notification Channels

| Channel | Purpose | Response Time |
|---------|---------|---------------|
| 🔔 **#incidents** | Primary incident coordination | < 5 minutes |
| ⚡ **#engineering-alerts** | Technical team notifications | < 10 minutes |
| 📢 **#general** | Company-wide updates | < 30 minutes |
| 📞 **Phone/SMS** | Critical escalation only | < 2 minutes |
| 📧 **Email** | Documentation & follow-up | < 1 hour |

### 🛠️ Critical Resources

<table>
<tr>
<th>Resource</th>
<th>Access Method</th>
<th>Purpose</th>
</tr>
<tr>
<td><strong>📊 Status Page</strong></td>
<td><a href="[URL]">[URL]</a><br/>💬 Slack: /status</td>
<td>Public system status<br/>Stakeholder updates</td>
</tr>
<tr>
<td><strong>📈 Monitoring Dashboard</strong></td>
<td><a href="[URL]">[Monitoring URL]</a><br/>🔑 [VPN required]</td>
<td>Real-time metrics<br/>System health</td>
</tr>
<tr>
<td><strong>🎯 Incident Management</strong></td>
<td><a href="[URL]">[Incident Tool URL]</a><br/>💬 Slack: /incident</td>
<td>Incident tracking<br/>Timeline management</td>
</tr>
<tr>
<td><strong>📚 Documentation</strong></td>
<td>📁 This runbook<br/>📁 <a href="./README.md">Documentation Hub</a></td>
<td>Procedures & guides<br/>Reference materials</td>
</tr>
<tr>
<td><strong>🚨 Emergency Scripts</strong></td>
<td>💻 <code>./scripts/emergency-*</code><br/>💻 <code>./scripts/health-diagnostics.sh</code></td>
<td>Automated recovery<br/>System diagnostics</td>
</tr>
</table>

## ⚡ Severity Levels & Response

> **🎯 Clear classification enables faster, more effective response**

### Severity 1 (Critical) - Immediate Response Required
**Definition**: Complete test infrastructure failure, blocking all development

**Examples**:
- All tests failing due to infrastructure
- Complete database inaccessibility
- Container orchestration system down
- CI/CD pipeline completely broken

**Response Time**: < 15 minutes
**Escalation**: Immediate to all teams

### Severity 2 (High) - Urgent Response Required
**Definition**: Significant test infrastructure degradation

**Examples**:
- >50% test failure rate
- Performance degradation >200% of baseline
- Partial database connectivity issues
- Recovery system in emergency mode

**Response Time**: < 30 minutes
**Escalation**: Engineering team

### Severity 3 (Medium) - Standard Response
**Definition**: Limited test infrastructure impact

**Examples**:
- Individual test failures
- Performance degradation 100-200% of baseline
- Non-critical service degradation
- Alert fatigue situations

**Response Time**: < 2 hours
**Escalation**: Development team

## Emergency Procedures

### 🚨 IMMEDIATE TRIAGE PROTOCOL

#### Step 1: Assess the Situation (2 minutes)
```bash
# Quick health assessment
./scripts/health-diagnostics.sh quick

# Check critical systems
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker-compose -f docker-compose.test.yml ps

# Check test pipeline status
npm run test:smoke 2>&1 | head -20
```

#### Step 2: Determine Severity (1 minute)
- **Complete failure** → Severity 1
- **Partial failure** → Severity 2  
- **Degraded performance** → Severity 3

#### Step 3: Initiate Response (2 minutes)
```bash
# Create incident log
echo "$(date): INCIDENT START - $(whoami) responding" >> logs/incident-$(date +%Y%m%d-%H%M).log

# Notify team (if Severity 1 or 2)
# Send status to #incidents channel
```

### 🔥 SEVERITY 1 EMERGENCY PROCEDURES

#### Immediate Actions (5 minutes)
```bash
#!/bin/bash
# Emergency Response Script - Save as scripts/emergency-response.sh

echo "🚨 EMERGENCY RESPONSE INITIATED"
echo "Time: $(date)"
echo "Operator: $(whoami)"

# 1. Capture current state
echo "📸 Capturing system state..."
./scripts/health-diagnostics.sh full
docker ps -a > logs/emergency-docker-state.log
docker-compose -f docker-compose.test.yml logs > logs/emergency-container-logs.log

# 2. Attempt quick fixes
echo "🔧 Attempting automated recovery..."

# Stop all containers
docker-compose -f docker-compose.test.yml down

# Clear Docker system
docker system prune -f

# Restart containers
docker-compose -f docker-compose.test.yml up -d

# Wait for startup
sleep 30

# Test basic functionality
if ./scripts/health-diagnostics.sh quick; then
    echo "✅ Emergency recovery successful"
    exit 0
else
    echo "❌ Emergency recovery failed - escalating"
    exit 1
fi
```

#### Full System Reset (10 minutes)
```bash
#!/bin/bash
# Complete Infrastructure Reset - Use only in extreme emergencies

echo "🚨 FULL SYSTEM RESET INITIATED"
echo "⚠️  This will destroy all test data and containers"

read -p "Type 'EMERGENCY RESET' to confirm: " confirm
if [ "$confirm" != "EMERGENCY RESET" ]; then
    echo "Reset cancelled"
    exit 1
fi

echo "🔥 Beginning complete reset..."

# 1. Stop all test-related processes
pkill -f "vitest"
pkill -f "playwright"
pkill -f "npm.*test"

# 2. Destroy all containers and volumes
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.dev.yml down -v 2>/dev/null || true

# 3. Clean Docker system completely
docker system prune -a -f
docker volume prune -f
docker network prune -f

# 4. Remove temporary files and caches
rm -rf node_modules/.cache
rm -rf node_modules/.vitest
rm -rf .next/cache
rm -rf test-results/
rm -rf coverage/
rm -rf logs/*.log

# 5. Reset Node modules (if package issues suspected)
echo "🔄 Resetting Node modules..."
rm -rf node_modules
npm ci

# 6. Rebuild test database schema
echo "🗄️ Rebuilding database schema..."
rm -rf migrations/
npm run db:generate
npm run db:push

# 7. Start fresh containers
echo "🐳 Starting fresh containers..."
docker-compose -f docker-compose.test.yml up -d

# 8. Wait for complete startup
echo "⏳ Waiting for services to initialize..."
sleep 60

# 9. Verify recovery
echo "✅ Verifying recovery..."
if ./scripts/health-diagnostics.sh quick; then
    echo "🎉 FULL SYSTEM RESET SUCCESSFUL"
    echo "System is operational"
else
    echo "❌ FULL SYSTEM RESET FAILED"
    echo "Manual intervention required"
    exit 1
fi
```

### 🔧 SEVERITY 2 RECOVERY PROCEDURES

#### Database Recovery Workflow
```bash
#!/bin/bash
# Database Recovery Procedure

echo "🗄️ Database Recovery Initiated"

# 1. Diagnose database issues
echo "📊 Diagnosing database..."
./scripts/health-diagnostics.sh database

# 2. Check container status
if ! docker-compose -f docker-compose.test.yml ps postgres-test | grep -q "Up"; then
    echo "🚀 Starting database container..."
    docker-compose -f docker-compose.test.yml up -d postgres-test
    sleep 30
fi

# 3. Test connectivity
echo "🔌 Testing connectivity..."
if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test; then
    echo "✅ Database connectivity restored"
else
    echo "❌ Database connectivity failed - attempting reset"
    
    # Reset database container
    docker-compose -f docker-compose.test.yml stop postgres-test
    docker-compose -f docker-compose.test.yml rm -f postgres-test
    docker volume rm vonkfi_postgres_data_test 2>/dev/null || true
    docker-compose -f docker-compose.test.yml up -d postgres-test
    
    sleep 45
    
    if docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test; then
        echo "✅ Database reset successful"
    else
        echo "❌ Database reset failed - escalating to Severity 1"
        exit 1
    fi
fi

# 4. Verify schema
echo "🔍 Verifying database schema..."
if docker-compose -f docker-compose.test.yml exec -T postgres-test psql -U test -d vonkfi_test -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | grep -q "4"; then
    echo "✅ Database schema verified"
else
    echo "🔄 Rebuilding database schema..."
    npm run db:push
fi

# 5. Test operations
echo "🧪 Testing database operations..."
if npm run test:smoke -- --reporter=json | jq -e '.testResults[0].status == "passed"' >/dev/null; then
    echo "✅ Database recovery successful"
else
    echo "❌ Database tests still failing"
    exit 1
fi
```

#### Container Recovery Workflow
```bash
#!/bin/bash
# Container Recovery Procedure

echo "🐳 Container Recovery Initiated"

# 1. Assess container health
echo "📊 Assessing container health..."
docker-compose -f docker-compose.test.yml ps

# 2. Identify problematic containers
UNHEALTHY_CONTAINERS=$(docker-compose -f docker-compose.test.yml ps --filter "status=exited" --format "{{.Service}}")

if [ -n "$UNHEALTHY_CONTAINERS" ]; then
    echo "🔧 Restarting unhealthy containers: $UNHEALTHY_CONTAINERS"
    
    for container in $UNHEALTHY_CONTAINERS; do
        echo "♻️ Restarting $container..."
        docker-compose -f docker-compose.test.yml restart "$container"
        sleep 10
        
        # Verify restart
        if docker-compose -f docker-compose.test.yml ps "$container" | grep -q "Up"; then
            echo "✅ $container restarted successfully"
        else
            echo "❌ $container failed to restart"
            
            # Force recreate
            echo "🔄 Force recreating $container..."
            docker-compose -f docker-compose.test.yml rm -f "$container"
            docker-compose -f docker-compose.test.yml up -d "$container"
            sleep 15
        fi
    done
else
    echo "ℹ️ No exited containers found"
fi

# 3. Check resource constraints
echo "📈 Checking resource usage..."
MEMORY_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" | sed 's/%//' | sort -n | tail -1)
if [ "${MEMORY_USAGE%.*}" -gt 90 ]; then
    echo "⚠️ High memory usage detected: ${MEMORY_USAGE}%"
    echo "🧹 Cleaning up unused containers and images..."
    docker system prune -f
fi

# 4. Verify all containers are healthy
echo "🏥 Verifying container health..."
sleep 30  # Allow time for health checks

ALL_HEALTHY=true
for service in postgres-test redis-test; do
    if docker-compose -f docker-compose.test.yml ps "$service" | grep -q "Up.*healthy"; then
        echo "✅ $service is healthy"
    else
        echo "❌ $service is not healthy"
        ALL_HEALTHY=false
    fi
done

if $ALL_HEALTHY; then
    echo "🎉 All containers are healthy"
else
    echo "⚠️ Some containers are still unhealthy - may need manual intervention"
    exit 1
fi
```

#### Connection Pool Recovery
```bash
#!/bin/bash
# Connection Pool Recovery Procedure

echo "🔌 Connection Pool Recovery Initiated"

# 1. Check current pool status
echo "📊 Checking pool status..."
if [ -f "logs/pool-metrics.log" ]; then
    tail -10 logs/pool-metrics.log
fi

# 2. Force release all connections
echo "🔓 Force releasing all connections..."
npx tsx -e "
import { poolManager } from './test/setup.js';
if (poolManager) {
  await poolManager.releaseAllLeases();
  console.log('All connections released');
} else {
  console.log('Pool manager not available');
}
"

# 3. Reset connection limits
echo "🔄 Resetting connection limits..."
docker-compose -f docker-compose.test.yml exec -T postgres-test psql -U test -d vonkfi_test -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'vonkfi_test' 
AND state = 'idle in transaction' 
AND query_start < now() - interval '5 minutes';
"

# 4. Restart with optimized settings
echo "⚙️ Restarting with optimized settings..."
POOL_RECOVERY=true npm run test:smoke

if [ $? -eq 0 ]; then
    echo "✅ Connection pool recovery successful"
else
    echo "❌ Connection pool recovery failed"
    exit 1
fi
```

## 🔄 Recovery Workflows

> **🎯 Visual decision trees for systematic recovery procedures**

### 🚨 Emergency Recovery Decision Matrix

<div align="center">

**Start here to determine your recovery path**

</div>

<table>
<tr>
<th>Issue Type</th>
<th>Symptoms</th>
<th>Recovery Workflow</th>
<th>Estimated Time</th>
</tr>
<tr>
<td><strong>🧪 Test Execution</strong></td>
<td>Tests failing, timeouts</td>
<td><a href="#workflow-1-test-execution-failure-recovery">Workflow 1</a></td>
<td>5-15 minutes</td>
</tr>
<tr>
<td><strong>🗄️ Database Issues</strong></td>
<td>Connection failures, slow queries</td>
<td><a href="#workflow-2-database-connectivity-recovery">Workflow 2</a></td>
<td>2-10 minutes</td>
</tr>
<tr>
<td><strong>⚡ Performance</strong></td>
<td>Slow execution, high resource usage</td>
<td><a href="#workflow-3-performance-degradation-recovery">Workflow 3</a></td>
<td>3-20 minutes</td>
</tr>
<tr>
<td><strong>🐳 Container Issues</strong></td>
<td>Container crashes, startup failures</td>
<td><a href="#workflow-4-container-recovery">Workflow 4</a></td>
<td>1-5 minutes</td>
</tr>
<tr>
<td><strong>🔌 Network Problems</strong></td>
<td>Port conflicts, connectivity issues</td>
<td><a href="#workflow-5-network-recovery">Workflow 5</a></td>
<td>2-8 minutes</td>
</tr>
</table>

---

### Workflow 1: Test Execution Failure Recovery

<details>
<summary><strong>🧪 Click to expand Test Execution Recovery workflow</strong></summary>

```mermaid
graph TD
    A[🧪 Test Failures Detected] --> B{📊 Check Failure Rate}
    B -->|>75% failures| C[🔥 Severity 1: Full Reset]
    B -->|25-75% failures| D[⚠️ Severity 2: Targeted Recovery]
    B -->|<25% failures| E[💛 Severity 3: Investigation]
    
    C --> F[🚨 Emergency System Reset]
    D --> G[🔧 Component Recovery]
    E --> H[🔍 Root Cause Analysis]
    
    F --> F1[Stop all processes]
    F1 --> F2[Reset containers & volumes]
    F2 --> F3[Clean Docker system]
    F3 --> F4[Reinstall dependencies]
    F4 --> F5[Rebuild database]
    F5 --> I{✅ Recovery Successful?}
    
    G --> G1[Identify failing components]
    G1 --> G2[Restart problematic services]
    G2 --> G3[Reset connection pools]
    G3 --> G4[Clear caches]
    G4 --> I
    
    H --> H1[Analyze recent changes]
    H1 --> H2[Check system resources]
    H2 --> H3[Review error patterns]
    H3 --> H4[Apply targeted fixes]
    H4 --> I
    
    I -->|✅ Yes| J[🧪 Verify All Tests Pass]
    I -->|❌ No| K[📞 Escalate to Manual Intervention]
    
    J --> J1[Run full test suite]
    J1 --> J2[Check performance metrics]
    J2 --> L[📝 Document Incident]
    
    K --> K1[Gather diagnostic data]
    K1 --> K2[Contact senior engineer]
    K2 --> M[🔬 Expert Analysis Required]
    
    L --> N[✅ Recovery Complete]
    M --> O[🔄 Continue with expert guidance]
```

**Key Commands:**
```bash
# Quick assessment
./scripts/health-diagnostics.sh quick

# Emergency reset (Severity 1)
./scripts/emergency-response.sh

# Component restart (Severity 2)
docker-compose -f docker-compose.test.yml restart
npm run test:smoke

# Investigation (Severity 3)
npm run test:run -- --reporter=verbose
```

</details>

---

### Workflow 2: Database Connectivity Recovery

<details>
<summary><strong>🗄️ Click to expand Database Recovery workflow</strong></summary>

```mermaid
graph TD
    A[🗄️ Database Connection Failed] --> B[🐳 Check Container Status]
    B -->|Container Down| C[🚀 Start Container]
    B -->|Container Up| D[🔍 Check Database Process]
    
    C --> C1[docker-compose up -d postgres-test]
    C1 --> E{✅ Container Started?}
    
    D --> D1[docker-compose exec postgres-test pg_isready]
    D1 --> F{🗄️ Database Responding?}
    
    E -->|❌ No| G[🔄 Recreate Container]
    E -->|✅ Yes| H[⏳ Wait for DB Startup]
    
    F -->|❌ No| I[🔄 Restart Database Service]
    F -->|✅ Yes| J[🔌 Check Connection Pool]
    
    G --> G1[docker-compose rm -f postgres-test]
    G1 --> G2[docker volume rm postgres_data_test]
    G2 --> G3[docker-compose up -d postgres-test]
    G3 --> H
    
    H --> H1[sleep 30]
    H1 --> K[🧪 Test Connectivity]
    
    I --> I1[docker-compose restart postgres-test]
    I1 --> I2[sleep 15]
    I2 --> K
    
    J --> J1[Check pool metrics]
    J1 --> J2[Kill idle connections]
    J2 --> L[🔄 Reset Pool Connections]
    
    K --> K1[psql postgresql://test:test@localhost:5434/vonkfi_test -c "SELECT 1;"]
    K1 --> M{🔗 Connected?}
    
    L --> L1[./scripts/reset-connection-pool.sh]
    L1 --> M
    
    M -->|✅ Yes| N[🔍 Verify Schema]
    M -->|❌ No| O[📞 Escalate to Full Reset]
    
    N --> N1[Check table existence]
    N1 --> P{📋 Schema Valid?}
    P -->|✅ Yes| Q[✅ Success]
    P -->|❌ No| R[🚀 Run Migrations]
    
    R --> R1[npm run db:generate]
    R1 --> R2[npm run db:migrate]
    R2 --> Q
    
    O --> O1[./scripts/full-system-reset.sh]
    O1 --> Q
```

**Key Commands:**
```bash
# Container check
docker-compose -f docker-compose.test.yml ps postgres-test

# Database connectivity test
docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d vonkfi_test

# Connection pool reset
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'vonkfi_test' AND state = 'idle in transaction';
"

# Schema verification
psql postgresql://test:test@localhost:5434/vonkfi_test -c "\dt"
```

</details>

---

### Workflow 3: Performance Degradation Recovery

<details>
<summary><strong>⚡ Click to expand Performance Recovery workflow</strong></summary>

```mermaid
graph TD
    A[⚡ Performance Issues Detected] --> B[🔍 Identify Bottleneck]
    B --> B1[Run performance diagnostics]
    B1 --> C{🎯 Bottleneck Type?}
    
    C -->|🧠 Memory| D[Memory Cleanup Path]
    C -->|⚙️ CPU| E[Process Optimization Path]
    C -->|🗄️ Database| F[DB Performance Path]
    C -->|🌐 Network| G[Network Diagnostics Path]
    
    D --> D1[🔍 Check memory usage]
    D1 --> D2[📊 Identify memory hogs]
    D2 --> H[🧹 Clear Caches & Force GC]
    H --> H1[docker system prune -f]
    H1 --> H2[Restart Node processes]
    H2 --> L[📈 Monitor Improvement]
    
    E --> E1[🔍 Check CPU usage]
    E1 --> E2[📊 Identify CPU-intensive processes]
    E2 --> I[⚙️ Reduce Concurrency]
    I --> I1[Reduce Vitest maxConcurrency]
    I1 --> I2[Lower connection pool size]
    I2 --> L
    
    F --> F1[🔍 Check query performance]
    F1 --> F2[📊 Analyze slow queries]
    F2 --> J[🗄️ Optimize Queries & Connections]
    J --> J1[Add missing indexes]
    J1 --> J2[Optimize connection pool]
    J2 --> J3[Kill long-running queries]
    J3 --> L
    
    G --> G1[🔍 Check port conflicts]
    G1 --> G2[📊 Test network connectivity]
    G2 --> K[🌐 Network Issue Resolution]
    K --> K1[Kill conflicting processes]
    K1 --> K2[Reset network configuration]
    K2 --> K3[Restart containers]
    K3 --> L
    
    L --> L1[⏱️ Run performance test]
    L1 --> L2[📊 Check metrics]
    L2 --> M{✅ Performance Restored?}
    
    M -->|✅ Yes| N[📝 Document Solution]
    M -->|❌ No| O[📞 Escalate or Reset]
    
    N --> N1[Update performance baseline]
    N1 --> N2[Create prevention measures]
    N2 --> P[✅ Recovery Complete]
    
    O --> O1{🤔 Try Full Reset?}
    O1 -->|Yes| O2[./scripts/full-system-reset.sh]
    O1 -->|No| O3[Contact senior engineer]
    O2 --> P
    O3 --> Q[🔬 Expert Analysis Required]
```

**Key Commands:**
```bash
# Performance diagnostics
./scripts/health-diagnostics.sh performance
top -p $(pgrep -f "vitest\|node")

# Memory cleanup
docker system prune -f
if (global.gc) global.gc();

# Database optimization
psql postgresql://test:test@localhost:5434/vonkfi_test -c "
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;
"

# Network diagnostics
netstat -tulpn | grep :5434
```

</details>

---

### Workflow 4: Container Recovery

<details>
<summary><strong>🐳 Click to expand Container Recovery workflow</strong></summary>

```mermaid
graph TD
    A[🐳 Container Issue Detected] --> B[📊 Check Container Status]
    B --> B1[docker-compose ps]
    B1 --> C{🔍 Container Status?}
    
    C -->|✅ Up (healthy)| D[✅ Container OK - Check App]
    C -->|⚠️ Up (unhealthy)| E[🔍 Health Check Failing]
    C -->|🔄 Up (starting)| F[⏳ Wait for Startup]
    C -->|❌ Exited| G[🔍 Check Exit Code]
    C -->|🔄 Restarting| H[🔍 Restart Loop Detected]
    C -->|❓ Not Found| I[⚠️ Container Missing]
    
    D --> D1[Check application logs]
    D1 --> D2[Verify service endpoints]
    D2 --> SUCCESS[✅ Recovery Complete]
    
    E --> E1[docker-compose logs service]
    E1 --> E2{🤔 Health Check Issue?}
    E2 -->|🗄️ Database connectivity| E3[Check database connection]
    E2 -->|📈 Resource limits| E4[Check memory/CPU limits]
    E2 -->|⏱️ Timeout| E5[Increase health check timeout]
    E3 --> RESTART[🔄 Restart Container]
    E4 --> RESTART
    E5 --> RESTART
    
    F --> F1[Wait 30 seconds]
    F1 --> F2{✅ Startup Complete?}
    F2 -->|Yes| SUCCESS
    F2 -->|No| G
    
    G --> G1[docker-compose logs --tail=20]
    G1 --> G2{🔍 Exit Code Analysis}
    G2 -->|0| G3[Normal exit - restart]
    G2 -->|1| G4[Error exit - check logs]
    G2 -->|125| G5[Docker error - check config]
    G2 -->|137| G6[Killed (OOM) - increase memory]
    G3 --> RESTART
    G4 --> FIX[🔧 Fix Configuration]
    G5 --> FIX
    G6 --> MEMORY[📈 Increase Memory Limits]
    
    H --> H1[Check restart frequency]
    H1 --> H2[Analyze restart pattern]
    H2 --> H3{🤔 Restart Cause?}
    H3 -->|📈 Memory| MEMORY
    H3 -->|⚙️ Config| FIX
    H3 -->|🌐 Network| NETWORK[🌐 Fix Network Issues]
    
    I --> I1[Check docker-compose.yml]
    I1 --> I2[Verify service definition]
    I2 --> CREATE[🚀 Create Container]
    
    RESTART --> R1[docker-compose restart service]
    R1 --> R2[Wait 15 seconds]
    R2 --> VERIFY[🧪 Verify Recovery]
    
    FIX --> F1[Edit configuration]
    F1 --> F2[docker-compose up -d --force-recreate]
    F2 --> VERIFY
    
    MEMORY --> M1[Update resource limits]
    M1 --> M2[docker-compose up -d --force-recreate]
    M2 --> VERIFY
    
    NETWORK --> N1[Check port conflicts]
    N1 --> N2[Fix network configuration]
    N2 --> RESTART
    
    CREATE --> C1[docker-compose up -d service]
    C1 --> VERIFY
    
    VERIFY --> V1[Run health check]
    V1 --> V2{✅ Healthy?}
    V2 -->|Yes| SUCCESS
    V2 -->|No| ESCALATE[📞 Escalate to Expert]
```

**Key Commands:**
```bash
# Container status check
docker-compose -f docker-compose.test.yml ps --format "table {{.Service}}\t{{.Status}}\t{{.Health}}"

# Container logs analysis
docker-compose -f docker-compose.test.yml logs --tail=50 postgres-test

# Container restart
docker-compose -f docker-compose.test.yml restart postgres-test

# Container recreation
docker-compose -f docker-compose.test.yml up -d --force-recreate postgres-test

# Resource monitoring
docker stats --no-stream
```

</details>

---

### Workflow 5: Network Recovery

<details>
<summary><strong>🌐 Click to expand Network Recovery workflow</strong></summary>

```mermaid
graph TD
    A[🌐 Network Issue Detected] --> B[🔍 Check Network Status]
    B --> B1[netstat -tulpn | grep :5434]
    B1 --> C{🔍 Port Status?}
    
    C -->|✅ Available| D[🔍 Check Connectivity]
    C -->|❌ In Use| E[🔍 Port Conflict]
    C -->|❓ Not Listening| F[🔍 Service Not Running]
    
    D --> D1[ping localhost]
    D1 --> D2[telnet localhost 5434]
    D2 --> D3{🔗 Connection Test?}
    D3 -->|✅ Success| G[🔍 Application Layer Issue]
    D3 -->|❌ Fail| H[🔍 Network Configuration]
    
    E --> E1[lsof -i :5434]
    E1 --> E2[Identify conflicting process]
    E2 --> E3{🤔 Safe to Kill?}
    E3 -->|✅ Yes| E4[kill -9 PID]
    E3 -->|❌ No| E5[Change port configuration]
    E4 --> RESTART[🔄 Restart Services]
    E5 --> CONFIG[⚙️ Update Configuration]
    
    F --> F1[Check if service is running]
    F1 --> F2[docker-compose ps]
    F2 --> F3{🐳 Container Status?}
    F3 -->|Running| F4[Check service binding]
    F3 -->|Not Running| START[🚀 Start Container]
    F4 --> BIND[🔧 Fix Service Binding]
    
    G --> G1[Check application logs]
    G1 --> G2[Test database connection]
    G2 --> G3{🗄️ DB Connection?}
    G3 -->|✅ OK| SUCCESS[✅ Issue Resolved]
    G3 -->|❌ Fail| DB[🗄️ Database Recovery]
    
    H --> H1[Check firewall rules]
    H1 --> H2[Check Docker network]
    H2 --> H3[Check host networking]
    H3 --> NETWORK[🌐 Fix Network Config]
    
    START --> S1[docker-compose up -d]
    S1 --> S2[Wait for startup]
    S2 --> VERIFY[🧪 Verify Network]
    
    CONFIG --> C1[Update docker-compose.yml]
    C1 --> C2[Update application config]
    C2 --> RESTART
    
    BIND --> B1[Check service configuration]
    B1 --> B2[Fix binding address]
    B2 --> RESTART
    
    RESTART --> R1[docker-compose restart]
    R1 --> R2[Wait 15 seconds]
    R2 --> VERIFY
    
    NETWORK --> N1[docker network prune]
    N1 --> N2[Reset network configuration]
    N2 --> N3[docker-compose down]
    N3 --> N4[docker-compose up -d]
    N4 --> VERIFY
    
    DB --> DB1[Run database recovery workflow]
    DB1 --> VERIFY
    
    VERIFY --> V1[Test all network connections]
    V1 --> V2{✅ All Tests Pass?}
    V2 -->|Yes| SUCCESS
    V2 -->|No| ESCALATE[📞 Expert Help Needed]
```

**Key Commands:**
```bash
# Network diagnostics
netstat -tulpn | grep -E "(5434|6381)"
lsof -i :5434

# Connectivity tests
ping localhost
telnet localhost 5434
curl -f http://localhost:5434/health || echo "Connection failed"

# Docker network management
docker network ls
docker network prune -f

# Port conflict resolution
sudo lsof -i :5434
sudo kill -9 $(lsof -t -i:5434)
```

</details>

---

### 🚀 Recovery Workflow Quick Reference

| Issue | Quick Command | Recovery Time |
|-------|---------------|---------------|
| **🧪 Test failures** | `npm run test:smoke` | 30 seconds |
| **🗄️ DB connection** | `docker-compose restart postgres-test` | 1-2 minutes |
| **⚡ Performance** | `docker system prune -f` | 1 minute |
| **🐳 Container crash** | `docker-compose up -d --force-recreate` | 2-3 minutes |
| **🌐 Network issues** | `docker network prune && docker-compose restart` | 1-2 minutes |
| **🚨 Complete failure** | `./scripts/emergency-response.sh` | 5-10 minutes |

## Rollback Procedures

### Code Rollback (Git-based)
```bash
#!/bin/bash
# Emergency Code Rollback

echo "🔄 Emergency Code Rollback Initiated"

# 1. Identify last known good commit
LAST_GOOD_COMMIT=$(git log --oneline --grep="✅" -1 --format="%H")
if [ -z "$LAST_GOOD_COMMIT" ]; then
    # Fallback to previous commit
    LAST_GOOD_COMMIT=$(git rev-parse HEAD~1)
fi

echo "🎯 Rolling back to: $LAST_GOOD_COMMIT"

# 2. Create emergency branch
EMERGENCY_BRANCH="emergency-rollback-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$EMERGENCY_BRANCH"

# 3. Perform rollback
git reset --hard "$LAST_GOOD_COMMIT"

# 4. Verify rollback
npm ci
npm run test:smoke

if [ $? -eq 0 ]; then
    echo "✅ Rollback successful"
    git push origin "$EMERGENCY_BRANCH"
else
    echo "❌ Rollback failed - tests still failing"
    exit 1
fi
```

### Database Schema Rollback
```bash
#!/bin/bash
# Database Schema Rollback

echo "🗄️ Database Schema Rollback Initiated"

# 1. Backup current schema
pg_dump -h localhost -p 5434 -U test -d vonkfi_test -s > backup-schema-$(date +%Y%m%d-%H%M%S).sql

# 2. Drop and recreate database
docker-compose -f docker-compose.test.yml exec -T postgres-test dropdb -U test vonkfi_test
docker-compose -f docker-compose.test.yml exec -T postgres-test createdb -U test vonkfi_test

# 3. Apply known good schema
if [ -f "backup-schema-known-good.sql" ]; then
    docker-compose -f docker-compose.test.yml exec -T postgres-test psql -U test -d vonkfi_test < backup-schema-known-good.sql
else
    # Use migrations from last known good commit
    git checkout HEAD~1 -- migrations/
    npm run db:push
    git checkout HEAD -- migrations/
fi

# 4. Verify schema
npm run test:smoke
```

### Configuration Rollback
```bash
#!/bin/bash
# Configuration Rollback

echo "⚙️ Configuration Rollback Initiated"

# 1. Backup current config
cp vitest.config.ts vitest.config.ts.backup.$(date +%Y%m%d-%H%M%S)
cp docker-compose.test.yml docker-compose.test.yml.backup.$(date +%Y%m%d-%H%M%S)

# 2. Restore known good configs
if [ -f "vitest.config.ts.known-good" ]; then
    cp vitest.config.ts.known-good vitest.config.ts
fi

if [ -f "docker-compose.test.yml.known-good" ]; then
    cp docker-compose.test.yml.known-good docker-compose.test.yml
fi

# 3. Restart with rolled back config
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up -d

# 4. Verify functionality
sleep 30
npm run test:smoke
```

## Communication Protocols

### Incident Declaration
```bash
# Incident notification template
INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"
SEVERITY="[SEV-1/SEV-2/SEV-3]"
SUMMARY="Brief description of the issue"

# Slack notification
curl -X POST -H 'Content-type: application/json' \
    --data "{
        \"text\": \"🚨 INCIDENT DECLARED - $INCIDENT_ID\",
        \"attachments\": [{
            \"color\": \"danger\",
            \"fields\": [
                {\"title\": \"Severity\", \"value\": \"$SEVERITY\", \"short\": true},
                {\"title\": \"Summary\", \"value\": \"$SUMMARY\", \"short\": false},
                {\"title\": \"Responder\", \"value\": \"$(whoami)\", \"short\": true},
                {\"title\": \"Time\", \"value\": \"$(date)\", \"short\": true}
            ]
        }]
    }" \
    $SLACK_WEBHOOK_URL
```

### Status Updates
```bash
# Regular status update template
UPDATE_MESSAGE="Current status and actions taken"

curl -X POST -H 'Content-type: application/json' \
    --data "{
        \"text\": \"📋 Update on $INCIDENT_ID\",
        \"attachments\": [{
            \"color\": \"warning\",
            \"fields\": [
                {\"title\": \"Status\", \"value\": \"$UPDATE_MESSAGE\", \"short\": false},
                {\"title\": \"Next Action\", \"value\": \"What's being done next\", \"short\": false},
                {\"title\": \"ETA\", \"value\": \"Estimated completion time\", \"short\": true}
            ]
        }]
    }" \
    $SLACK_WEBHOOK_URL
```

### Resolution Notification
```bash
# Incident resolution template
RESOLUTION_SUMMARY="How the incident was resolved"
DURATION="Total incident duration"

curl -X POST -H 'Content-type: application/json' \
    --data "{
        \"text\": \"✅ INCIDENT RESOLVED - $INCIDENT_ID\",
        \"attachments\": [{
            \"color\": \"good\",
            \"fields\": [
                {\"title\": \"Resolution\", \"value\": \"$RESOLUTION_SUMMARY\", \"short\": false},
                {\"title\": \"Duration\", \"value\": \"$DURATION\", \"short\": true},
                {\"title\": \"Responder\", \"value\": \"$(whoami)\", \"short\": true}
            ]
        }]
    }" \
    $SLACK_WEBHOOK_URL
```

## Post-Incident Procedures

### Immediate Post-Resolution (15 minutes)
```bash
#!/bin/bash
# Post-Incident Immediate Actions

echo "📋 Post-Incident Procedures Started"

# 1. Verify system stability
echo "🔍 Verifying system stability..."
for i in {1..3}; do
    echo "Stability check $i/3..."
    npm run test:smoke
    sleep 60
done

# 2. Document the incident
INCIDENT_LOG="logs/incident-$(date +%Y%m%d-%H%M%S).md"
cat > "$INCIDENT_LOG" << EOF
# Incident Report

## Summary
- **Incident ID**: $INCIDENT_ID
- **Severity**: $SEVERITY
- **Start Time**: [TIME]
- **End Time**: $(date)
- **Duration**: [CALCULATE]
- **Responder**: $(whoami)

## Description
[Description of what happened]

## Root Cause
[Root cause analysis]

## Resolution
[What was done to resolve]

## Lessons Learned
[What we learned from this incident]

## Action Items
- [ ] [Follow-up action 1]
- [ ] [Follow-up action 2]

EOF

echo "📝 Incident documented in: $INCIDENT_LOG"

# 3. Backup current working state
echo "💾 Creating system state backup..."
./scripts/health-diagnostics.sh full
tar -czf "logs/post-incident-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
    vitest.config.ts \
    docker-compose.test.yml \
    test/setup.ts \
    package.json \
    package-lock.json

echo "✅ Post-incident procedures completed"
```

### 24-Hour Follow-up
```bash
#!/bin/bash
# 24-Hour Post-Incident Review

echo "📅 24-Hour Post-Incident Review"

# 1. System health verification
echo "🏥 Performing comprehensive health check..."
./scripts/health-diagnostics.sh full

# 2. Performance analysis
echo "📊 Analyzing performance metrics..."
if [ -d "logs/health-reports" ]; then
    echo "Performance trends since incident:"
    find logs/health-reports -name "*.json" -newer logs/incident-*.log | \
        xargs jq -r '.timestamp + " " + .overall_status + " " + (.summary.health_score | tostring)'
fi

# 3. Update monitoring thresholds if needed
echo "⚙️ Reviewing monitoring thresholds..."
# [Add logic to review and update alerting thresholds]

echo "✅ 24-hour review completed"
```

### Post-Mortem Template
```markdown
# Post-Mortem: [Incident Title]

## Executive Summary
Brief summary of the incident, impact, and resolution.

## Incident Details
- **Date/Time**: [Start] - [End] (Duration: [X] hours)
- **Severity**: [1-3]
- **Services Affected**: Test Infrastructure
- **Impact**: [Description of impact]
- **Responders**: [Names]

## Timeline
| Time | Event | Action Taken |
|------|--------|--------------|
| [Time] | [Event] | [Action] |

## Root Cause Analysis
### What Happened
[Technical details of what went wrong]

### Why It Happened
[Root cause - technical, process, or human factors]

### Why It Wasn't Caught Earlier
[Monitoring gaps, alert issues, etc.]

## Resolution and Recovery
[Step-by-step description of how the incident was resolved]

## Impact Assessment
- **Duration**: [X] hours
- **Development Impact**: [Description]
- **Test Pipeline Impact**: [Description]
- **User Impact**: [If any]

## Lessons Learned
### What Went Well
- [Positive aspects of the response]

### What Could Be Improved
- [Areas for improvement]

## Action Items
| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| [Action] | [Person] | [Date] | [High/Medium/Low] |

## Prevention Measures
[Steps taken to prevent recurrence]

## Appendix
- **Logs**: [Links to relevant logs]
- **Metrics**: [Screenshots or data]
- **Communication**: [Slack threads, emails, etc.]
```

## Prevention & Monitoring

### Automated Monitoring Setup
```bash
#!/bin/bash
# Enhanced Monitoring Setup

echo "📊 Setting up enhanced monitoring..."

# 1. Create monitoring scripts
cat > scripts/continuous-monitoring.sh << 'EOF'
#!/bin/bash
# Continuous monitoring daemon

MONITORING_INTERVAL=60  # 1 minute
ALERT_THRESHOLD_FILE="monitoring/alert-thresholds.json"

while true; do
    # Perform health check
    HEALTH_RESULT=$(./scripts/health-diagnostics.sh quick 2>&1)
    HEALTH_STATUS=$?
    
    # Log results
    echo "$(date '+%Y-%m-%d %H:%M:%S'): Health check status: $HEALTH_STATUS" >> logs/continuous-monitoring.log
    
    # Check for critical issues
    if [ $HEALTH_STATUS -ne 0 ]; then
        echo "🚨 CRITICAL: Health check failed at $(date)" >> logs/critical-alerts.log
        
        # Send alert (customize for your notification system)
        # ./scripts/send-alert.sh "Critical health check failure"
    fi
    
    # Check disk space
    DISK_USAGE=$(df . | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$DISK_USAGE" -gt 90 ]; then
        echo "🚨 CRITICAL: Disk usage at ${DISK_USAGE}% at $(date)" >> logs/critical-alerts.log
    fi
    
    # Check memory usage
    if command -v free >/dev/null 2>&1; then
        MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
        if [ "$MEMORY_USAGE" -gt 90 ]; then
            echo "🚨 CRITICAL: Memory usage at ${MEMORY_USAGE}% at $(date)" >> logs/critical-alerts.log
        fi
    fi
    
    sleep $MONITORING_INTERVAL
done
EOF

chmod +x scripts/continuous-monitoring.sh

# 2. Create alert thresholds configuration
mkdir -p monitoring
cat > monitoring/alert-thresholds.json << 'EOF'
{
  "memory_usage_critical": 90,
  "memory_usage_warning": 80,
  "disk_usage_critical": 90,
  "disk_usage_warning": 85,
  "test_failure_rate_critical": 50,
  "test_failure_rate_warning": 25,
  "response_time_critical": 5000,
  "response_time_warning": 2000,
  "connection_errors_critical": 10,
  "connection_errors_warning": 5
}
EOF

echo "✅ Enhanced monitoring setup completed"
```

### Preventive Maintenance Schedule
```bash
#!/bin/bash
# Preventive Maintenance Tasks

echo "🔧 Running preventive maintenance..."

# Daily tasks
daily_maintenance() {
    echo "📅 Daily maintenance tasks..."
    
    # Clean up old logs
    find logs/ -name "*.log" -mtime +7 -delete
    
    # Clean up old test results
    find test-results/ -name "*.xml" -mtime +3 -delete
    
    # Docker cleanup
    docker system prune -f --filter "until=24h"
    
    # Health check report
    ./scripts/health-diagnostics.sh quick > logs/daily-health-$(date +%Y%m%d).log
}

# Weekly tasks
weekly_maintenance() {
    echo "📅 Weekly maintenance tasks..."
    
    # Full system health check
    ./scripts/health-diagnostics.sh full
    
    # Database optimization
    docker-compose -f docker-compose.test.yml exec -T postgres-test psql -U test -d vonkfi_test -c "VACUUM ANALYZE;"
    
    # Update base images
    docker-compose -f docker-compose.test.yml pull
    
    # Dependency audit
    npm audit --audit-level=moderate
}

# Monthly tasks
monthly_maintenance() {
    echo "📅 Monthly maintenance tasks..."
    
    # Full backup
    mkdir -p backups/monthly/$(date +%Y%m)
    tar -czf "backups/monthly/$(date +%Y%m)/full-backup-$(date +%Y%m%d).tar.gz" \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=logs \
        .
    
    # Performance baseline update
    npm run test:performance > "baselines/performance-$(date +%Y%m).log"
    
    # Security scan
    npm audit
    ./scripts/security-scan.sh
}

# Run appropriate maintenance based on argument
case "${1:-daily}" in
    "daily")
        daily_maintenance
        ;;
    "weekly")
        weekly_maintenance
        ;;
    "monthly")
        monthly_maintenance
        ;;
    "all")
        daily_maintenance
        weekly_maintenance
        monthly_maintenance
        ;;
    *)
        echo "Usage: $0 {daily|weekly|monthly|all}"
        exit 1
        ;;
esac

echo "✅ Preventive maintenance completed"
```

### Chaos Engineering Tests
```bash
#!/bin/bash
# Chaos Engineering for Test Infrastructure

echo "🌪️ Running chaos engineering tests..."

# Test 1: Memory pressure simulation
simulate_memory_pressure() {
    echo "🧠 Simulating memory pressure..."
    
    # Create memory pressure
    stress --vm 1 --vm-bytes 80% --timeout 60s &
    STRESS_PID=$!
    
    # Run tests under pressure
    npm run test:smoke
    TEST_RESULT=$?
    
    # Clean up
    kill $STRESS_PID 2>/dev/null || true
    
    if [ $TEST_RESULT -eq 0 ]; then
        echo "✅ Tests passed under memory pressure"
    else
        echo "❌ Tests failed under memory pressure"
    fi
}

# Test 2: Database connection interruption
simulate_db_interruption() {
    echo "🗄️ Simulating database interruption..."
    
    # Stop database temporarily
    docker-compose -f docker-compose.test.yml stop postgres-test &
    
    # Try to run tests
    timeout 30 npm run test:smoke &
    TEST_PID=$!
    
    # Restart database after 10 seconds
    sleep 10
    docker-compose -f docker-compose.test.yml start postgres-test
    
    # Wait for test completion
    wait $TEST_PID
    TEST_RESULT=$?
    
    if [ $TEST_RESULT -eq 0 ]; then
        echo "✅ Tests recovered from database interruption"
    else
        echo "⚠️ Tests struggled with database interruption"
    fi
}

# Test 3: Container restart during tests
simulate_container_restart() {
    echo "🐳 Simulating container restart during tests..."
    
    # Start tests in background
    npm run test:unit &
    TEST_PID=$!
    
    # Restart containers after 5 seconds
    sleep 5
    docker-compose -f docker-compose.test.yml restart
    
    # Wait for test completion
    wait $TEST_PID
    TEST_RESULT=$?
    
    echo "Container restart impact: Exit code $TEST_RESULT"
}

# Run chaos tests
echo "🎯 Starting chaos engineering tests..."
simulate_memory_pressure
sleep 30
simulate_db_interruption
sleep 30
simulate_container_restart

echo "🌪️ Chaos engineering tests completed"
```

## Quick Reference Cards

### Emergency Commands Cheat Sheet
```bash
# EMERGENCY QUICK REFERENCE

# 1. IMMEDIATE TRIAGE
./scripts/health-diagnostics.sh quick                    # 30-second health check
docker ps --format "table {{.Names}}\t{{.Status}}"      # Container status
npm run test:smoke                                       # Basic test verification

# 2. EMERGENCY STOPS
docker-compose -f docker-compose.test.yml down          # Stop all test containers
pkill -f "vitest\|playwright\|npm.*test"               # Kill all test processes
docker system prune -f                                  # Clean Docker resources

# 3. EMERGENCY RESTARTS
./scripts/emergency-response.sh                         # Automated recovery
docker-compose -f docker-compose.test.yml up -d         # Start containers
npm ci && npm run test:smoke                            # Reinstall and verify

# 4. NUCLEAR OPTIONS (EXTREME CASES ONLY)
./scripts/full-system-reset.sh                         # Complete infrastructure reset
rm -rf node_modules && npm ci                          # Full dependency reset
docker system prune -a -f                              # Remove everything Docker

# 5. VERIFICATION
./scripts/health-diagnostics.sh full                   # Comprehensive check
npm run test:coverage                                   # Full test suite
```

### Contact Information Template
```
🚨 EMERGENCY CONTACTS

Primary On-Call: [Name] [Phone] [Email] [@slack-handle]
Secondary: [Name] [Phone] [Email] [@slack-handle]
Engineering Manager: [Name] [Phone] [Email] [@slack-handle]
DevOps Lead: [Name] [Phone] [Email] [@slack-handle]

📞 ESCALATION PATH
1. Primary On-Call (0-15 min)
2. Secondary On-Call (15-30 min)  
3. Engineering Manager (30-60 min)
4. [Senior Management] (60+ min)

🔗 RESOURCES
Status Page: [URL]
Monitoring: [URL]
Runbook: [This document URL]
Incident Management: [URL]
CI/CD Pipeline: [URL]

#️⃣ SLACK CHANNELS
#incidents - Main incident coordination
#engineering - Technical discussion
#devops - Infrastructure issues
#alerts - Automated alerts
```

---

**Remember**: This runbook is a living document. Update it after each incident to improve our response procedures. The goal is to minimize downtime and maintain the reliability of our test infrastructure.