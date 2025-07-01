import '@testing-library/jest-dom';
import {afterAll, afterEach, beforeAll, vi} from 'vitest';
import {cleanup} from '@testing-library/react';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import {mockStorage} from './mocks/storage.mock';
import { TestConnectionPoolManager } from './utils/connection-pool-manager';
import { initializeRecoverySystem } from './utils/connection-recovery-system';

// Add ResizeObserver polyfill for Recharts components
class ResizeObserverPolyfill {
    observe() {
    }

    unobserve() {
    }

    disconnect() {
    }
}

// @ts-ignore
global.ResizeObserver = global.ResizeObserver || ResizeObserverPolyfill;

// Mock getBoundingClientRect for charts that need dimensions
const mockGetBoundingClientRect = () => ({
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    bottom: 400,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
});

// Apply to all elements during tests
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    value: mockGetBoundingClientRect,
    writable: true,
    configurable: true
});

// Add matchMedia polyfill for responsive design tests
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

const {Pool} = pg;

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
let poolManager: TestConnectionPoolManager;

// Function to check if test database is available (containers managed by run-tests.sh)
const checkTestDatabase = async (): Promise<boolean> => {
    try {
        console.log('🔍 Checking test database availability...');

        // Try to connect to the database (should be started by run-tests.sh)
        const quickTest = new Pool({
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user,
            password: dbConfig.password,
            connectionTimeoutMillis: 3000
        });

        const client = await quickTest.connect();
        await client.query('SELECT 1');
        client.release();
        await quickTest.end();

        console.log('✅ Test database is available!');
        return true;
    } catch (error) {
        console.warn('❌ Test database not available:', error.message);
        return false;
    }
};

// Enhanced function to wait for database with exponential backoff
const waitForDatabase = async (): Promise<boolean> => {
    console.log('Waiting for database to be ready...');
    let attempts = 0;
    const maxAttempts = 10; // Reduced attempts but with exponential backoff
    const baseDelay = 500; // Start with 500ms
    const maxDelay = 8000; // Cap at 8 seconds

    while (attempts < maxAttempts) {
        try {
            const testPool = new Pool({
                host: dbConfig.host,
                port: dbConfig.port,
                database: dbConfig.database,
                user: dbConfig.user,
                password: dbConfig.password,
                connectionTimeoutMillis: 3000
            });

            const client = await testPool.connect();
            await client.query('SELECT 1');
            client.release();
            await testPool.end();

            console.log('✅ Test database is ready!');
            return true;
        } catch (error) {
            attempts++;
            
            if (attempts >= maxAttempts) {
                console.error(`❌ Database failed to become ready after ${maxAttempts} attempts`);
                throw new Error(`Database failed to become ready within timeout. Last error: ${error.message}`);
            }

            // Calculate exponential backoff delay with jitter
            const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);
            const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
            const finalDelay = Math.floor(delay + jitter);
            
            console.log(`Attempt ${attempts}/${maxAttempts} failed, retrying in ${finalDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, finalDelay));
        }
    }

    throw new Error('Database failed to become ready within timeout');
};

// Function to cleanup test data (containers managed by run-tests.sh)
const cleanupTestData = async (): Promise<void> => {
    if (testPool && !dbConnectionFailed) {
        try {
            console.log('🧹 Cleaning up test data...');
            const client = await testPool.connect();

            // Check if tables exist before cleaning
            const tablesExist = await client.query(`
                SELECT EXISTS (SELECT
                               FROM information_schema.tables
                               WHERE table_schema = 'public'
                                 AND table_name = 'users');
            `);

            if (tablesExist.rows[0].exists) {
                // Clean up test data without dropping schema
                await client.query('TRUNCATE TABLE transaction_hashes, transfer_recommendations, goals, transactions, accounts, import_history, users, categories RESTART IDENTITY CASCADE');
                console.log('✅ Test data cleaned up');
            } else {
                console.log('📋 No test data to clean up');
            }

            client.release();
        } catch (error) {
            console.warn('Failed to cleanup test data:', error.message);
        }
    }
};

// Function to clean test data between test suites (much faster than schema reset)
const cleanTestData = async (pool: pg.Pool): Promise<void> => {
    try {
        console.log('🧹 Cleaning test data...');
        const client = await pool.connect();

        // Check if tables exist before trying to clean them
        const tablesExist = await client.query(`
            SELECT EXISTS (SELECT
                           FROM information_schema.tables
                           WHERE table_schema = 'public'
                             AND table_name = 'users');
        `);

        if (tablesExist.rows[0].exists) {
            // Clear data from all tables in dependency order
            await client.query('TRUNCATE TABLE transaction_hashes, transfer_recommendations, goals, transactions, accounts, import_history, users, categories RESTART IDENTITY CASCADE');
            console.log('✅ Test data cleaned');
        } else {
            console.log('📋 No tables to clean - schema not yet created');
        }

        client.release();
    } catch (error) {
        console.warn('Test data cleanup failed:', error.message);
        // Don't throw error for cleanup failures, just continue
    }
};

// Function to run database migrations
const runMigrations = async (db: ReturnType<typeof drizzle>): Promise<void> => {
    try {
        console.log('Running database migrations...');
        // Import and run migrations using drizzle-kit
        const {migrate} = await import('drizzle-orm/node-postgres/migrator');
        await migrate(db, {migrationsFolder: './migrations'});
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
        // Check if test database is available (started by run-tests.sh)
        const dbAvailable = await checkTestDatabase();

        if (!dbAvailable) {
            throw new Error('Test database not available - ensure run-tests.sh started containers');
        }

        // Create enhanced connection pool manager
        poolManager = new TestConnectionPoolManager({
            host: dbConfig.host,
            port: dbConfig.port,
            database: dbConfig.database,
            user: dbConfig.user,
            password: dbConfig.password,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 20, // Increased for better concurrency
            min: 2,   // Keep minimum connections open
            maxLeaseTime: 30000, // 30 second max lease time
            healthCheckInterval: 5000, // Health check every 5 seconds
            leaseTimeoutAlert: 20000, // Alert after 20 seconds
            enableMetrics: true
        });

        // Extract the underlying pool for legacy compatibility
        testPool = (poolManager as any).pool;

        // Initialize the recovery system
        initializeRecoverySystem(poolManager);

        testDb = drizzle({client: testPool, schema});

        // Check if migrations are needed first
        let needsMigrations = false;
        try {
            const client = await testPool.connect();
            const result = await client.query("SELECT to_regclass('public.users')");
            client.release();

            if (!result.rows[0].to_regclass) {
                needsMigrations = true;
            }
        } catch (migrationError) {
            needsMigrations = true;
        }

        // Run migrations if needed
        if (needsMigrations) {
            console.log('🔄 Running database migrations...');
            await runMigrations(testDb);
            console.log('✅ Migrations completed');
        } else {
            console.log('📋 Database schema already exists, skipping migrations');
            // Clean existing test data only if schema exists
            await cleanTestData(testPool);
        }

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

// Cleanup test data (not containers - managed by run-tests.sh)
afterAll(async () => {
    try {
        await cleanupTestData();
        if (poolManager) {
            // Release all leases and destroy the pool manager
            await poolManager.destroy();
        } else if (testPool) {
            await testPool.end();
        }
    } catch (error) {
        console.warn('Cleanup warning:', error);
    }
});

// Export test database utilities and connection status
export {testPool, testDb, dbConnectionFailed, poolManager};
