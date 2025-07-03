# Test Performance Optimization Design

## Current Problems

### 1. Multiple Container Management Systems
- `run-tests.sh` starts containers globally
- `test/setup.ts` attempts individual container provisioning  
- E2E `global-setup.ts` also starts containers independently
- **Result**: Container conflicts, redundant startup time, inconsistent state

### 2. Database Reset Overhead
- Full database schema drop/recreate per test file
- Multiple migration runs
- **Result**: 117s total test time, unnecessary overhead

### 3. Connection Issues
- Tests skip due to "no database connection" despite successful setup
- Inconsistent environment detection logic
- **Result**: 82 test failures, many skipped tests

## Optimization Strategy

### 1. Centralized Container Management
- **Single Source of Truth**: Only `run-tests.sh` manages containers
- **Remove Redundancy**: Eliminate container logic from `setup.ts` and E2E setup
- **Better Health Checks**: Improve database readiness detection

### 2. Shared Connection Pool
- **Global Pool**: Create single connection pool in `setup.ts`
- **Connection Reuse**: Share pool across all test files
- **Proper Cleanup**: Close pool only in global teardown

### 3. Data Cleanup vs Reset
- **Per-Test Cleanup**: Clean specific test data instead of full resets
- **Preserve Schema**: Keep tables and structure intact
- **Faster Turnaround**: ~90% faster than schema recreation

### 4. Improved Environment Detection
- **Container Status Check**: Verify containers are actually running
- **Connection Validation**: Test actual database connectivity
- **Fallback Logic**: Graceful degradation to mocks when needed

## Implementation Plan

### Phase 1: Streamline Container Management
1. Update `run-tests.sh` with better health checks
2. Remove container logic from `test/setup.ts`
3. Remove container logic from E2E setup/teardown
4. Add container status verification

### Phase 2: Optimize Database Operations  
1. Replace schema resets with data cleanup
2. Run migrations only once at startup
3. Implement shared connection pool
4. Add per-test data isolation

### Phase 3: Fix Environment Detection
1. Improve database connection detection
2. Fix test skipping logic
3. Add better error handling and fallbacks

## Expected Performance Improvements
- **50-70% faster test execution** (target: ~40-50s instead of 117s)
- **Eliminate redundant container operations** 
- **Fix skipped tests** (target: 0 skipped due to DB issues)
- **Maintain same pass/fail ratio** (406 passed, handle 82 failed appropriately)

## Risk Mitigation
- **Incremental Implementation**: Deploy changes in phases
- **Baseline Comparison**: Verify same test results before/after
- **Rollback Plan**: Keep original setup files as backup
- **Test Isolation**: Ensure test data cleanup maintains isolation