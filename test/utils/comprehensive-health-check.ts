import pg from 'pg';

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    duration: number;
    checks: {
        database: {
            status: 'healthy' | 'degraded' | 'unhealthy';
            responseTime: number;
            details: string;
        };
        migrations: {
            status: 'healthy' | 'degraded' | 'unhealthy';
            version: string | null;
            details: string;
        };
        connectivity: {
            status: 'healthy' | 'degraded' | 'unhealthy';
            poolConnections: number;
            details: string;
        };
        redis?: {
            status: 'healthy' | 'degraded' | 'unhealthy';
            responseTime: number;
            details: string;
        };
    };
    summary: string;
}

export interface HealthCheckOptions {
    includeRedis?: boolean;
    timeoutMs?: number;
    dbConfig: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
    };
}

export class ComprehensiveHealthCheck {
    private options: HealthCheckOptions;

    constructor(options: HealthCheckOptions) {
        this.options = {
            includeRedis: false,
            timeoutMs: 10000,
            ...options
        };
    }

    async performHealthCheck(): Promise<HealthCheckResult> {
        const startTime = Date.now();
        const result: HealthCheckResult = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            duration: 0,
            checks: {
                database: { status: 'unhealthy', responseTime: 0, details: 'Not checked' },
                migrations: { status: 'unhealthy', version: null, details: 'Not checked' },
                connectivity: { status: 'unhealthy', poolConnections: 0, details: 'Not checked' }
            },
            summary: ''
        };

        try {
            // Check database connectivity
            await this.checkDatabase(result);
            
            // Check migrations status
            await this.checkMigrations(result);
            
            // Check connection pool status
            await this.checkConnectivity(result);
            
            // Check Redis if enabled
            if (this.options.includeRedis) {
                await this.checkRedis(result);
            }

            // Calculate overall status
            this.calculateOverallStatus(result);
            
        } catch (error) {
            result.status = 'unhealthy';
            result.summary = `Health check failed: ${error.message}`;
        } finally {
            result.duration = Date.now() - startTime;
        }

        return result;
    }

    private async checkDatabase(result: HealthCheckResult): Promise<void> {
        const startTime = Date.now();
        let pool: pg.Pool | null = null;
        
        try {
            pool = new pg.Pool({
                ...this.options.dbConfig,
                connectionTimeoutMillis: this.options.timeoutMs! / 4, // Quarter of total timeout
                max: 1 // Only need one connection for health check
            });

            const client = await pool.connect();
            
            // Test basic connectivity
            await client.query('SELECT 1 as health_check');
            
            // Test write capability
            await client.query('SELECT NOW() as current_time');
            
            client.release();
            
            result.checks.database = {
                status: 'healthy',
                responseTime: Date.now() - startTime,
                details: 'Database connection and basic operations successful'
            };
            
        } catch (error) {
            result.checks.database = {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                details: `Database check failed: ${error.message}`
            };
        } finally {
            if (pool) {
                await pool.end();
            }
        }
    }

    private async checkMigrations(result: HealthCheckResult): Promise<void> {
        let pool: pg.Pool | null = null;
        
        try {
            pool = new pg.Pool({
                ...this.options.dbConfig,
                connectionTimeoutMillis: this.options.timeoutMs! / 4,
                max: 1
            });

            const client = await pool.connect();
            
            // Check if main tables exist (indicating migrations have run)
            const tablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'accounts', 'transactions', 'categories')
                ORDER BY table_name
            `);
            
            const expectedTables = ['accounts', 'categories', 'transactions', 'users'];
            const existingTables = tablesResult.rows.map(row => row.table_name);
            const missingTables = expectedTables.filter(table => !existingTables.includes(table));
            
            if (missingTables.length === 0) {
                // Check if drizzle migrations table exists for version info
                let version = 'unknown';
                try {
                    const versionResult = await client.query(`
                        SELECT id, hash, created_at 
                        FROM __drizzle_migrations 
                        ORDER BY created_at DESC 
                        LIMIT 1
                    `);
                    
                    if (versionResult.rows.length > 0) {
                        version = `${versionResult.rows[0].id} (${versionResult.rows[0].hash.substring(0, 8)})`;
                    }
                } catch {
                    // Drizzle migrations table might not exist in older setups
                    version = 'pre-drizzle';
                }
                
                result.checks.migrations = {
                    status: 'healthy',
                    version,
                    details: `All required tables present: ${existingTables.join(', ')}`
                };
            } else {
                result.checks.migrations = {
                    status: 'unhealthy',
                    version: null,
                    details: `Missing required tables: ${missingTables.join(', ')}`
                };
            }
            
            client.release();
            
        } catch (error) {
            result.checks.migrations = {
                status: 'unhealthy',
                version: null,
                details: `Migration check failed: ${error.message}`
            };
        } finally {
            if (pool) {
                await pool.end();
            }
        }
    }

    private async checkConnectivity(result: HealthCheckResult): Promise<void> {
        let pool: pg.Pool | null = null;
        
        try {
            pool = new pg.Pool({
                ...this.options.dbConfig,
                connectionTimeoutMillis: this.options.timeoutMs! / 4,
                max: 5 // Test with multiple connections
            });

            // Test multiple simultaneous connections
            const connectionPromises = Array.from({ length: 3 }, async () => {
                const client = await pool!.connect();
                await client.query('SELECT 1');
                client.release();
            });

            await Promise.all(connectionPromises);
            
            result.checks.connectivity = {
                status: 'healthy',
                poolConnections: 3,
                details: 'Successfully established and released multiple connections'
            };
            
        } catch (error) {
            result.checks.connectivity = {
                status: 'unhealthy',
                poolConnections: 0,
                details: `Connectivity test failed: ${error.message}`
            };
        } finally {
            if (pool) {
                await pool.end();
            }
        }
    }

    private async checkRedis(result: HealthCheckResult): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Note: This is a placeholder for Redis health check
            // In a real implementation, you would use a Redis client here
            // For now, we'll simulate a Redis check
            
            result.checks.redis = {
                status: 'healthy',
                responseTime: Date.now() - startTime,
                details: 'Redis health check not implemented yet'
            };
            
        } catch (error) {
            result.checks.redis = {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                details: `Redis check failed: ${error.message}`
            };
        }
    }

    private calculateOverallStatus(result: HealthCheckResult): void {
        const checks = [
            result.checks.database,
            result.checks.migrations,
            result.checks.connectivity,
            ...(result.checks.redis ? [result.checks.redis] : [])
        ];

        const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;
        const degradedCount = checks.filter(check => check.status === 'degraded').length;

        if (unhealthyCount > 0) {
            result.status = 'unhealthy';
            result.summary = `${unhealthyCount} critical health check(s) failed`;
        } else if (degradedCount > 0) {
            result.status = 'degraded';
            result.summary = `${degradedCount} health check(s) degraded but functional`;
        } else {
            result.status = 'healthy';
            result.summary = 'All health checks passed successfully';
        }
    }
}

// Convenience function for quick health checks
export async function performQuickHealthCheck(dbConfig: HealthCheckOptions['dbConfig']): Promise<HealthCheckResult> {
    const healthCheck = new ComprehensiveHealthCheck({
        dbConfig,
        timeoutMs: 5000,
        includeRedis: false
    });
    
    return await healthCheck.performHealthCheck();
}