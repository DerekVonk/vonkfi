import '@testing-library/jest-dom';
import { expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import { mockStorage } from './mocks/storage.mock';

const { Pool } = pg;

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Test database configuration
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5434/vonkfi_test';

// Set environment variable for tests
process.env.DATABASE_URL = TEST_DATABASE_URL;

let testPool: pg.Pool;
let testDb: ReturnType<typeof drizzle>;
let dbConnectionFailed = false;

// Only mock the storage module if explicitly requested
if (process.env.USE_MOCK_STORAGE === 'true') {
  vi.mock('../server/storage', () => {
    return {
      storage: mockStorage,
      IStorage: vi.fn(),
      DatabaseStorage: vi.fn()
    };
  });
}

// Test database setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_AUTH_FOR_TESTS = 'true';
  process.env.TEST_MODE = 'true';

  try {
    // Create test database pool
    testPool = new Pool({
      connectionString: TEST_DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 5
    });

    testDb = drizzle({ client: testPool, schema });

    // Test connection
    const client = await testPool.connect();
    await client.query('SELECT 1');
    client.release();

    console.log('Test database connected successfully');
    dbConnectionFailed = false;
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Operation failed:', error.message);
    } else {
      console.warn('Unknown error:', String(error));
    }
    dbConnectionFailed = true;

    // Always use mock storage when database connection fails
    console.log('Using mock storage for tests due to database connection failure');
    process.env.SKIP_DB_TESTS = 'true';
    process.env.USE_MOCK_STORAGE = 'true';

    // Mock the storage module if it's not already mocked
    if (!vi.isMockFunction(require('../server/storage').storage)) {
      vi.mock('../server/storage', () => {
        return {
          storage: mockStorage,
          IStorage: vi.fn(),
          DatabaseStorage: vi.fn()
        };
      });
    }
  }
});

// Cleanup test database
afterAll(async () => {
  if (testPool) {
    await testPool.end();
  }
});

// Export test database utilities and connection status
export { testPool, testDb, dbConnectionFailed };
