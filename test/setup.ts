import '@testing-library/jest-dom';
import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import { execSync } from 'child_process';
import { mockStorage } from './mocks/storage.mock';

const { Pool } = pg;

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Environment-specific database configuration
const getTestDatabaseConfig = () => {
  const isCI = process.env.CI === 'true';
  const nodeEnv = process.env.NODE_ENV;
  
  // Default test database configuration
  const defaultConfig = {
    host: 'localhost',
    port: 5434,
    database: 'vonkfi_test',
    user: 'test',
    password: 'test'
  };

  // Production test environment (CI/CD)
  if (isCI || nodeEnv === 'production-test') {
    return {
      ...defaultConfig,
      // Production test environment might use different credentials
      host: process.env.TEST_DB_HOST || defaultConfig.host,
      port: parseInt(process.env.TEST_DB_PORT || String(defaultConfig.port)),
      database: process.env.TEST_DB_NAME || defaultConfig.database,
      user: process.env.TEST_DB_USER || defaultConfig.user,
      password: process.env.TEST_DB_PASSWORD || defaultConfig.password
    };
  }

  // Local development test environment
  return {
    ...defaultConfig,
    host: process.env.TEST_DATABASE_HOST || defaultConfig.host,
    port: parseInt(process.env.TEST_DATABASE_PORT || String(defaultConfig.port)),
    database: process.env.TEST_DATABASE_NAME || defaultConfig.database,
    user: process.env.TEST_DATABASE_USER || defaultConfig.user,
    password: process.env.TEST_DATABASE_PASSWORD || defaultConfig.password
  };
};

const dbConfig = getTestDatabaseConfig();
const TEST_DATABASE_URL = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

// Set environment variable for tests
process.env.DATABASE_URL = TEST_DATABASE_URL;

let testPool: pg.Pool;
let testDb: ReturnType<typeof drizzle>;
let dbConnectionFailed = false;
let dockerContainerStarted = false;

// Function to provision test database
const provisionTestDatabase = async (): Promise<boolean> => {
  try {
    console.log('🚀 Provisioning test database...');
    
    // Check if docker is available
    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      console.warn('Docker not available, assuming database is already running');
      return true;
    }

    // Start test database with docker-compose
    console.log('Starting PostgreSQL test container...');
    execSync('docker-compose -f docker-compose.test.yml up -d postgres-test', { 
      stdio: 'inherit',
      timeout: 60000 // 60 second timeout
    });
    
    dockerContainerStarted = true;
    
    // Wait for database to be ready
    console.log('Waiting for database to be ready...');
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (attempts < maxAttempts) {
      try {
        const testPool = new Pool({
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
          connectionTimeoutMillis: 2000
        });
        
        const client = await testPool.connect();
        await client.query('SELECT 1');
        client.release();
        await testPool.end();
        
        console.log('✅ Test database is ready!');
        return true;
      } catch {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error('Database failed to become ready within timeout');
  } catch (error) {
    console.error('Failed to provision test database:', error);
    return false;
  }
};

// Function to cleanup test database
const cleanupTestDatabase = async (): Promise<void> => {
  if (dockerContainerStarted) {
    try {
      console.log('🧹 Cleaning up test database...');
      execSync('docker-compose -f docker-compose.test.yml down -v', { 
        stdio: 'inherit',
        timeout: 30000 // 30 second timeout
      });
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.warn('Failed to cleanup test database:', error);
    }
  }
};

// Function to clean and reset database
const resetTestDatabase = async (pool: pg.Pool): Promise<void> => {
  try {
    console.log('Resetting test database...');
    const client = await pool.connect();
    
    // Drop all tables to ensure clean state
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
    `);
    
    client.release();
    console.log('✅ Test database reset completed');
  } catch (error) {
    console.warn('Database reset failed:', error);
    throw error;
  }
};

// Function to run database migrations
const runMigrations = async (db: ReturnType<typeof drizzle>): Promise<void> => {
  try {
    console.log('Running database migrations...');
    // Import and run migrations using drizzle-kit
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('✅ Migrations completed');
  } catch (error) {
    console.warn('Migration failed, continuing with mock storage:', error);
    throw error;
  }
};

// Mock storage when database is not available
vi.mock('../server/storage', () => {
  return {
    storage: mockStorage,
    IStorage: vi.fn(),
    DatabaseStorage: vi.fn()
  };
});

// Test database setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_AUTH_FOR_TESTS = 'true';
  process.env.TEST_MODE = 'true';

  try {
    // Provision test database
    const dbProvisioned = await provisionTestDatabase();
    
    if (!dbProvisioned) {
      throw new Error('Failed to provision test database');
    }

    // Create test database pool
    testPool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 10
    });

    testDb = drizzle({ client: testPool, schema });

    // Reset database to ensure clean state
    await resetTestDatabase(testPool);

    // Run migrations
    await runMigrations(testDb);

    // Test final connection
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();

    console.log('✅ Test database setup completed successfully');
    dbConnectionFailed = false;
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Database setup failed:', error.message);
    } else {
      console.warn('Unknown database setup error:', String(error));
    }
    dbConnectionFailed = true;

    // Fall back to mock storage
    console.log('📦 Using mock storage for tests due to database setup failure');
    process.env.SKIP_DB_TESTS = 'true';
    process.env.USE_MOCK_STORAGE = 'true';
  }
});

// Cleanup test database
afterAll(async () => {
  try {
    if (testPool) {
      await testPool.end();
    }
    await cleanupTestDatabase();
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
});

// Export test database utilities and connection status
export { testPool, testDb, dbConnectionFailed };
