import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import { Pool } from 'pg';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');

  // Setup test database
  await setupTestDatabase();
  
  // Wait for server to be ready
  await waitForServer(config.webServer?.url || 'http://localhost:3000');
  
  // Setup test data
  await setupTestData();
  
  console.log('✅ E2E test setup completed');
}

async function setupTestDatabase() {
  console.log('📀 Checking test database availability...');
  
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/vonkfi_test';
  
  try {
    // Database should already be started by run-tests.sh or test infrastructure
    // Just verify connectivity
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    
    console.log('✅ Database connectivity verified');
  } catch (error) {
    console.error('❌ Database not available for E2E tests:', error);
    throw error;
  }
}

async function waitForServer(url: string) {
  console.log(`⏳ Waiting for server at ${url}...`);
  
  const maxAttempts = 30;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        console.log('✅ Server is ready');
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Server at ${url} did not become ready within ${maxAttempts * 2} seconds`);
}

async function setupTestData() {
  console.log('📊 Setting up test data...');
  
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/vonkfi_test';
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    const client = await pool.connect();
    
    // Create test user
    await client.query(`
      INSERT INTO users (username, password_hash, created_at)
      VALUES ('e2e_test_user', '$2b$10$K8aKwS.nFG3YqI9OJ3.3Z.Xn7H9q3DpGIq7A2TmXbRdSQhJpF6qdO', NOW())
      ON CONFLICT (username) DO NOTHING
    `);
    
    // Get user ID
    const userResult = await client.query(
      'SELECT id FROM users WHERE username = $1',
      ['e2e_test_user']
    );
    const userId = userResult.rows[0]?.id;
    
    if (userId) {
      // Create test accounts
      await client.query(`
        INSERT INTO accounts (user_id, iban, account_holder_name, custom_name, balance, role, created_at)
        VALUES 
          ($1, 'NL91ABNA0417164300', 'E2E Test User', 'Main Account', 5000.00, 'income', NOW()),
          ($1, 'NL91ABNA0417164301', 'E2E Test User', 'Savings Account', 10000.00, 'savings', NOW()),
          ($1, 'NL91ABNA0417164302', 'E2E Test User', 'Emergency Fund', 3000.00, 'emergency', NOW())
        ON CONFLICT (iban) DO NOTHING
      `, [userId]);
      
      // Create test categories
      await client.query(`
        INSERT INTO categories (name, type, icon, color, created_at)
        VALUES 
          ('E2E Groceries', 'expense', '🛒', '#ff6b6b', NOW()),
          ('E2E Salary', 'income', '💰', '#51cf66', NOW()),
          ('E2E Transport', 'expense', '🚗', '#339af0', NOW())
        ON CONFLICT (name) DO NOTHING
      `);
      
      // Create test goals
      await client.query(`
        INSERT INTO goals (user_id, name, target_amount, current_amount, priority, target_date, created_at)
        VALUES 
          ($1, 'E2E Vacation Fund', 2000.00, 500.00, 'medium', '2024-12-31', NOW()),
          ($1, 'E2E Emergency Buffer', 5000.00, 3000.00, 'high', '2024-06-30', NOW())
        ON CONFLICT DO NOTHING
      `, [userId]);
      
      console.log('✅ Test data created successfully');
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Failed to setup test data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

export default globalSetup;