import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import { Pool } from 'pg';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test teardown...');

  // Clean up test data
  await cleanupTestData();
  
  // Stop test database (if using Docker and not in CI)
  if (process.env.CI !== 'true') {
    await stopTestDatabase();
  }
  
  console.log('✅ E2E test teardown completed');
}

async function cleanupTestData() {
  console.log('🗑️  Cleaning up test data...');
  
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/vonkfi_test';
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    const client = await pool.connect();
    
    // Clean up test data in reverse dependency order
    await client.query(`DELETE FROM transaction_hashes WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
    await client.query(`DELETE FROM transfer_recommendations WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
    await client.query(`DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
    await client.query(`DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%'))`);
    await client.query(`DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
    await client.query(`DELETE FROM import_history WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%')`);
    await client.query(`DELETE FROM users WHERE username LIKE 'e2e_%'`);
    await client.query(`DELETE FROM categories WHERE name LIKE 'E2E %'`);
    
    console.log('✅ Test data cleaned up');
    client.release();
  } catch (error) {
    console.error('❌ Failed to cleanup test data:', error);
  } finally {
    await pool.end();
  }
}

async function stopTestDatabase() {
  console.log('🛑 Stopping test database...');
  
  try {
    execSync('docker-compose -f docker-compose.test.yml down', { 
      stdio: 'inherit',
      timeout: 30000
    });
    
    console.log('✅ Test database stopped');
  } catch (error) {
    console.warn('⚠️  Failed to stop test database:', error);
  }
}

export default globalTeardown;