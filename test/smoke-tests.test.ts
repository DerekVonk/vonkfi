import { describe, test, expect, beforeAll } from 'vitest';
import { ComprehensiveHealthCheck, performQuickHealthCheck } from './utils/comprehensive-health-check';
import { TestConnectionPoolManager } from './utils/connection-pool-manager';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';

describe('Infrastructure Smoke Tests', () => {
    let dbConfig: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    };

    beforeAll(async () => {
        // Get database configuration from environment
        const isCI = process.env.CI === 'true';
        const nodeEnv = process.env.NODE_ENV;

        const defaultConfig = {
            host: 'localhost',
            port: 5434,
            database: 'vonkfi_test',
            user: 'test',
            password: 'test'
        };

        if (isCI || nodeEnv === 'production-test') {
            dbConfig = {
                ...defaultConfig,
                host: process.env.TEST_DB_HOST || defaultConfig.host,
                port: parseInt(process.env.TEST_DB_PORT || String(defaultConfig.port)),
                database: process.env.TEST_DB_NAME || defaultConfig.database,
                user: process.env.TEST_DB_USER || defaultConfig.user,
                password: process.env.TEST_DB_PASSWORD || defaultConfig.password
            };
        } else {
            dbConfig = {
                ...defaultConfig,
                host: process.env.TEST_DATABASE_HOST || defaultConfig.host,
                port: parseInt(process.env.TEST_DATABASE_PORT || String(defaultConfig.port)),
                database: process.env.TEST_DATABASE_NAME || defaultConfig.database,
                user: process.env.TEST_DATABASE_USER || defaultConfig.user,
                password: process.env.TEST_DATABASE_PASSWORD || defaultConfig.password
            };
        }

        // Set up database URL for migrations
        const TEST_DATABASE_URL = `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
        process.env.DATABASE_URL = TEST_DATABASE_URL;

        // Check if migrations need to be run
        const pool = new pg.Pool(dbConfig);
        try {
            const db = drizzle({ client: pool, schema });
            
            // Check if migrations are needed
            let needsMigrations = false;
            try {
                const client = await pool.connect();
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
                const { migrate } = await import('drizzle-orm/node-postgres/migrator');
                await migrate(db, { migrationsFolder: './migrations' });
                console.log('✅ Migrations completed');
            } else {
                console.log('✅ Migrations completed');
            }
        } finally {
            await pool.end();
        }
    });

    test('comprehensive health check passes', async () => {
        // Add a brief wait to ensure migrations have time to commit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const healthCheck = new ComprehensiveHealthCheck({
            dbConfig,
            timeoutMs: 10000,
            includeRedis: false
        });

        const result = await healthCheck.performHealthCheck();

        // Log detailed results for debugging
        console.log('🏥 Health Check Results:');
        console.log(`Overall Status: ${result.status}`);
        console.log(`Duration: ${result.duration}ms`);
        console.log('Individual Checks:');
        Object.entries(result.checks).forEach(([name, check]) => {
            console.log(`  ${name}: ${check.status} - ${check.details}`);
        });

        expect(result.status).toBe('healthy');
        expect(result.checks.database.status).toBe('healthy');
        expect(result.checks.migrations.status).toBe('healthy');
        expect(result.checks.connectivity.status).toBe('healthy');
    }, 15000);

    test('database basic connectivity', async () => {
        const pool = new pg.Pool({
            ...dbConfig,
            connectionTimeoutMillis: 5000,
            max: 1
        });

        try {
            const client = await pool.connect();
            const result = await client.query('SELECT 1 as test_value, NOW() as current_time');
            
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].test_value).toBe(1);
            expect(result.rows[0].current_time).toBeInstanceOf(Date);
            
            client.release();
        } finally {
            await pool.end();
        }
    });

    test('database schema is properly migrated', async () => {
        const pool = new pg.Pool({
            ...dbConfig,
            connectionTimeoutMillis: 5000,
            max: 1
        });

        try {
            const client = await pool.connect();
            
            // Debug: Check what tables exist
            const allTablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            `);
            console.log('📋 All existing tables:', allTablesResult.rows.map(row => row.table_name));
            
            // Check for essential tables
            const tablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'accounts', 'transactions', 'categories')
                ORDER BY table_name
            `);

            const tableNames = tablesResult.rows.map(row => row.table_name);
            console.log('📋 Required tables found:', tableNames);
            
            expect(tableNames).toContain('users');
            expect(tableNames).toContain('accounts');
            expect(tableNames).toContain('transactions');
            expect(tableNames).toContain('categories');

            // Test basic insert capability
            await client.query('BEGIN');
            const testResult = await client.query(`
                INSERT INTO categories (name, type, color) 
                VALUES ('smoke_test_category', 'essential', '#FF0000') 
                RETURNING id, name
            `);
            expect(testResult.rows).toHaveLength(1);
            expect(testResult.rows[0].name).toBe('smoke_test_category');
            await client.query('ROLLBACK');

            client.release();
        } finally {
            await pool.end();
        }
    }, 30000);

    test('connection pool manager functionality', async () => {
        const poolManager = new TestConnectionPoolManager({
            ...dbConfig,
            connectionTimeoutMillis: 5000,
            max: 5,
            min: 1,
            enableMetrics: true
        });

        try {
            // Test connection lease
            const lease = await poolManager.leaseConnection();
            expect(lease).toBeDefined();
            expect(lease.client).toBeDefined();

            // Test query through leased connection
            const result = await lease.client.query('SELECT 1 as test');
            expect(result.rows[0].test).toBe(1);

            // Release the connection
            await poolManager.releaseConnection(lease);

            // Test metrics collection
            const metrics = poolManager.getMetrics();
            expect(metrics).toBeDefined();
            expect(metrics.totalConnections).toBeGreaterThanOrEqual(0);
            expect(metrics.activeConnections).toBeGreaterThanOrEqual(0);

        } finally {
            await poolManager.destroy();
        }
    });

    test('performance baseline check', async () => {
        const startTime = Date.now();
        const result = await performQuickHealthCheck(dbConfig);
        const duration = Date.now() - startTime;

        // Health check should complete within reasonable time
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        expect(result.status).toBe('healthy');
        expect(result.duration).toBeGreaterThan(0);

        console.log(`⚡ Performance baseline: Health check completed in ${duration}ms`);
    });

    test('concurrent connection handling', async () => {
        const pool = new pg.Pool({
            ...dbConfig,
            connectionTimeoutMillis: 5000,
            max: 10
        });

        try {
            // Test 5 concurrent connections
            const concurrentQueries = Array.from({ length: 5 }, async (_, index) => {
                const client = await pool.connect();
                try {
                    const result = await client.query('SELECT $1 as connection_id, NOW() as timestamp', [index]);
                    return result.rows[0];
                } finally {
                    client.release();
                }
            });

            const results = await Promise.all(concurrentQueries);
            expect(results).toHaveLength(5);
            
            // Verify all connections worked
            results.forEach((result, index) => {
                expect(parseInt(result.connection_id)).toBe(index);
                expect(result.timestamp).toBeInstanceOf(Date);
            });

        } finally {
            await pool.end();
        }
    });

    test('error recovery simulation', async () => {
        const pool = new pg.Pool({
            ...dbConfig,
            connectionTimeoutMillis: 5000, // Give more time for connections
            max: 2, // Allow more connections to avoid deadlock
            min: 1
        });

        try {
            // Test that we can recover from query errors
            let errorOccurred = false;
            let client;
            
            try {
                client = await pool.connect();
                // Intentionally bad query
                await client.query('SELECT * FROM non_existent_table');
            } catch (error) {
                errorOccurred = true;
                expect(error.message).toContain('does not exist');
            } finally {
                if (client) {
                    client.release();
                }
            }

            expect(errorOccurred).toBe(true);

            // Verify pool still works after error - use a fresh connection
            client = await pool.connect();
            const result = await client.query('SELECT 1 as recovery_test');
            expect(result.rows[0].recovery_test).toBe(1);
            client.release();

        } finally {
            await pool.end();
        }
    }, 30000);
});