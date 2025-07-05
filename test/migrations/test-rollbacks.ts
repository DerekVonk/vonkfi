#!/usr/bin/env tsx

/**
 * Migration Rollback Test Runner
 * 
 * This script tests database migration rollbacks to ensure they work correctly
 * and maintain data integrity.
 */

import { Pool } from 'pg';
import { MigrationTestRunner } from './migration-test-runner';

async function runRollbackTests() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/vonkfi_test';
  
  console.log('🔄 Starting migration rollback tests...');
  console.log(`Database: ${DATABASE_URL}`);
  
  let pool: Pool | null = null;
  let testRunner: MigrationTestRunner | null = null;
  
  try {
    // Parse DATABASE_URL for connection config
    const url = new URL(DATABASE_URL);
    const dbConfig = {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading /
      user: url.username,
      password: url.password,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10
    };
    
    // Create database connection pool
    pool = new Pool(dbConfig);
    
    // Test database connection
    console.log('🔍 Testing database connection...');
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connection successful');
    
    // Create test runner
    testRunner = new MigrationTestRunner(pool);
    
    // Run rollback tests
    console.log('🚀 Running migration rollback tests...');
    const rollbackResults = await testRunner.testMigrationRollbacks();
    
    if (rollbackResults.length === 0) {
      console.log('📋 No rollback files found - this is normal if you haven\'t created rollback migrations');
      console.log('✅ Rollback test completed successfully (no rollbacks to test)');
      return;
    }
    
    // Analyze results
    const successfulRollbacks = rollbackResults.filter(r => r.success);
    const failedRollbacks = rollbackResults.filter(r => !r.success);
    const integrityIssues = rollbackResults.filter(r => !r.dataIntegrityCheck);
    
    console.log('\n📊 Rollback Test Results:');
    console.log(`Total rollbacks tested: ${rollbackResults.length}`);
    console.log(`Successful: ${successfulRollbacks.length}`);
    console.log(`Failed: ${failedRollbacks.length}`);
    console.log(`Data integrity issues: ${integrityIssues.length}`);
    
    // Log detailed results
    if (successfulRollbacks.length > 0) {
      console.log('\n✅ Successful Rollbacks:');
      successfulRollbacks.forEach(result => {
        console.log(`  - ${result.migrationFile} (${result.executionTime}ms)`);
      });
    }
    
    if (failedRollbacks.length > 0) {
      console.log('\n❌ Failed Rollbacks:');
      failedRollbacks.forEach(result => {
        console.log(`  - ${result.migrationFile}: ${result.error}`);
      });
    }
    
    if (integrityIssues.length > 0) {
      console.log('\n⚠️ Data Integrity Issues:');
      integrityIssues.forEach(result => {
        console.log(`  - ${result.migrationFile}: Data integrity check failed`);
      });
    }
    
    // Determine overall success
    if (failedRollbacks.length > 0 || integrityIssues.length > 0) {
      console.log('\n💥 Rollback tests failed');
      process.exit(1);
    } else {
      console.log('\n🎉 All rollback tests passed successfully');
    }
    
  } catch (error) {
    console.error('💥 Rollback test execution failed:', error);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Database connection refused. Make sure PostgreSQL is running and accessible.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔍 Database host not found. Check your DATABASE_URL configuration.');
    } else if (error.message.includes('password authentication failed')) {
      console.error('🔐 Database authentication failed. Check your username and password.');
    }
    
    process.exit(1);
  } finally {
    // Cleanup
    if (testRunner) {
      await testRunner.close();
    }
    if (pool) {
      await pool.end();
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runRollbackTests().catch((error) => {
    console.error('💥 Failed to run rollback tests:', error);
    process.exit(1);
  });
}

export { runRollbackTests };