import { TestConnectionPoolManager } from './connection-pool-manager';
import { poolManager } from '../setup';
import pg from 'pg';

export interface SchemaIsolationConfig {
  enabled: boolean;
  usePerTestSchemas: boolean;
  usePerFileSchemas: boolean;
  schemaPrefix: string;
  autoCleanup: boolean;
  migrationTimeout: number;
}

export interface IsolatedSchema {
  name: string;
  testFile: string;
  testName?: string;
  createdAt: Date;
  migrated: boolean;
  entityCount: number;
  connectionPool?: TestConnectionPoolManager;
}

export class SchemaIsolationSystem {
  private static config: SchemaIsolationConfig = {
    enabled: false,
    usePerTestSchemas: false,
    usePerFileSchemas: false,
    schemaPrefix: 'test_schema',
    autoCleanup: true,
    migrationTimeout: 30000
  };

  private static activeSchemas = new Map<string, IsolatedSchema>();
  private static schemaConnectionPools = new Map<string, TestConnectionPoolManager>();

  static configure(config: Partial<SchemaIsolationConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('🗂️ Schema isolation system configured:', this.config);
  }

  static async createIsolatedSchema(testFile: string, testName?: string): Promise<IsolatedSchema> {
    if (!this.config.enabled) {
      throw new Error('Schema isolation is not enabled. Call SchemaIsolationSystem.configure({enabled: true}) first.');
    }

    const schemaName = this.generateSchemaName(testFile, testName);
    
    if (this.activeSchemas.has(schemaName)) {
      return this.activeSchemas.get(schemaName)!;
    }

    console.log(`🏗️ Creating isolated schema: ${schemaName}`);

    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const leaseId = await poolManager.acquireLease('schema-isolation', 'createSchema');
    
    try {
      const client = poolManager.getClient(leaseId);
      
      // Create the schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      
      // Set search path for this connection
      await client.query(`SET search_path TO "${schemaName}", public`);
      
      const schema: IsolatedSchema = {
        name: schemaName,
        testFile,
        testName,
        createdAt: new Date(),
        migrated: false,
        entityCount: 0
      };

      // Create dedicated connection pool for this schema if per-test isolation
      if (this.config.usePerTestSchemas && testName) {
        schema.connectionPool = await this.createSchemaConnectionPool(schemaName);
      }

      this.activeSchemas.set(schemaName, schema);
      
      console.log(`✅ Isolated schema created: ${schemaName}`);
      return schema;
    } finally {
      poolManager.releaseLease(leaseId);
    }
  }

  private static generateSchemaName(testFile: string, testName?: string): string {
    const cleanFile = testFile.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const timestamp = Date.now().toString().slice(-6);
    
    let schemaName = `${this.config.schemaPrefix}_${cleanFile}_${timestamp}`;
    
    if (this.config.usePerTestSchemas && testName) {
      const cleanTest = testName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 20);
      schemaName += `_${cleanTest}`;
    }

    return schemaName;
  }

  private static async createSchemaConnectionPool(schemaName: string): Promise<TestConnectionPoolManager> {
    const baseConfig = {
      host: process.env.TEST_DATABASE_HOST || 'localhost',
      port: parseInt(process.env.TEST_DATABASE_PORT || '5434'),
      database: process.env.TEST_DATABASE_NAME || 'vonkfi_test',
      user: process.env.TEST_DATABASE_USER || 'test',
      password: process.env.TEST_DATABASE_PASSWORD || 'test',
      max: 3, // Smaller pools for schema isolation
      min: 1,
      maxLeaseTime: 15000,
      healthCheckInterval: 15000,
      enableMetrics: true,
      // Set default schema search path
      options: `-c search_path="${schemaName}",public`
    };

    const poolManager = new TestConnectionPoolManager(baseConfig);
    this.schemaConnectionPools.set(schemaName, poolManager);
    
    console.log(`🔗 Created dedicated connection pool for schema: ${schemaName}`);
    return poolManager;
  }

  static async migrateSchema(schemaName: string): Promise<void> {
    const schema = this.activeSchemas.get(schemaName);
    if (!schema) {
      throw new Error(`Schema ${schemaName} not found`);
    }

    if (schema.migrated) {
      console.log(`📋 Schema ${schemaName} already migrated`);
      return;
    }

    console.log(`🔄 Running migrations for schema: ${schemaName}`);

    const pool = schema.connectionPool || poolManager;
    if (!pool) {
      throw new Error('No connection pool available');
    }

    const leaseId = await pool.acquireLease('schema-migration', `migrate-${schemaName}`);
    
    try {
      const client = pool.getClient(leaseId);
      
      // Set search path to the isolated schema
      await client.query(`SET search_path TO "${schemaName}", public`);
      
      // Run migrations - this is a simplified version
      // In practice, you'd run your actual migration files
      await this.runSchemaMigrations(client, schemaName);
      
      schema.migrated = true;
      console.log(`✅ Schema ${schemaName} migrated successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to migrate schema ${schemaName}:`, error);
      throw error;
    } finally {
      pool.releaseLease(leaseId);
    }
  }

  private static async runSchemaMigrations(client: pg.PoolClient, schemaName: string): Promise<void> {
    // This is a simplified migration - in practice you'd use your migration system
    const migrations = [
      `CREATE TABLE IF NOT EXISTS "${schemaName}".users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}".categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL,
        icon VARCHAR(10),
        color VARCHAR(7),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}".accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
        iban VARCHAR(34) UNIQUE NOT NULL,
        account_holder_name VARCHAR(255) NOT NULL,
        custom_name VARCHAR(255),
        balance DECIMAL(10,2) DEFAULT 0,
        role VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}".goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        target_amount DECIMAL(10,2) NOT NULL,
        current_amount DECIMAL(10,2) DEFAULT 0,
        priority VARCHAR(50),
        target_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    ];

    for (const migration of migrations) {
      try {
        await client.query(migration);
      } catch (error) {
        console.error(`Migration failed: ${migration.substring(0, 50)}...`, error);
        throw error;
      }
    }
  }

  static async getSchemaConnection(schemaName: string): Promise<string> {
    const schema = this.activeSchemas.get(schemaName);
    if (!schema) {
      throw new Error(`Schema ${schemaName} not found`);
    }

    const pool = schema.connectionPool || poolManager;
    if (!pool) {
      throw new Error('No connection pool available');
    }

    const leaseId = await pool.acquireLease('schema-connection', `use-${schemaName}`);
    
    // Set search path for this connection
    const client = pool.getClient(leaseId);
    await client.query(`SET search_path TO "${schemaName}", public`);
    
    return leaseId;
  }

  static releaseSchemaConnection(leaseId: string, schemaName?: string): void {
    if (schemaName) {
      const schema = this.activeSchemas.get(schemaName);
      const pool = schema?.connectionPool || poolManager;
      pool?.releaseLease(leaseId);
    } else if (poolManager) {
      poolManager.releaseLease(leaseId);
    }
  }

  static async withIsolatedSchema<T>(
    testFile: string,
    testName: string,
    operation: (schemaName: string, leaseId: string) => Promise<T>
  ): Promise<T> {
    const schema = await this.createIsolatedSchema(testFile, testName);
    
    if (!schema.migrated) {
      await this.migrateSchema(schema.name);
    }

    const leaseId = await this.getSchemaConnection(schema.name);
    
    try {
      return await operation(schema.name, leaseId);
    } finally {
      this.releaseSchemaConnection(leaseId, schema.name);
      
      if (this.config.autoCleanup) {
        await this.cleanupSchema(schema.name);
      }
    }
  }

  static async cleanupSchema(schemaName: string): Promise<void> {
    const schema = this.activeSchemas.get(schemaName);
    if (!schema) {
      console.warn(`Schema ${schemaName} not found for cleanup`);
      return;
    }

    console.log(`🧹 Cleaning up schema: ${schemaName}`);

    try {
      // Clean up dedicated connection pool if exists
      if (schema.connectionPool) {
        await schema.connectionPool.destroy();
        this.schemaConnectionPools.delete(schemaName);
      }

      // Drop the schema
      if (poolManager) {
        const leaseId = await poolManager.acquireLease('schema-cleanup', `drop-${schemaName}`);
        try {
          const client = poolManager.getClient(leaseId);
          await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          console.log(`✅ Schema ${schemaName} dropped successfully`);
        } finally {
          poolManager.releaseLease(leaseId);
        }
      }

      this.activeSchemas.delete(schemaName);
    } catch (error) {
      console.error(`❌ Failed to cleanup schema ${schemaName}:`, error);
    }
  }

  static async cleanupAllSchemas(): Promise<void> {
    const schemaNames = Array.from(this.activeSchemas.keys());
    console.log(`🧹 Cleaning up ${schemaNames.length} isolated schemas...`);

    for (const schemaName of schemaNames) {
      try {
        await this.cleanupSchema(schemaName);
      } catch (error) {
        console.error(`Failed to cleanup schema ${schemaName}:`, error);
      }
    }

    this.activeSchemas.clear();
    this.schemaConnectionPools.clear();
  }

  static getActiveSchemas(): IsolatedSchema[] {
    return Array.from(this.activeSchemas.values());
  }

  static getSchemaInfo(schemaName: string): IsolatedSchema | undefined {
    return this.activeSchemas.get(schemaName);
  }

  static generateSchemaReport(): string {
    const activeSchemas = this.getActiveSchemas();
    
    let report = '\n🗂️ SCHEMA ISOLATION SYSTEM REPORT\n';
    report += '═'.repeat(60) + '\n\n';
    
    report += `Enabled: ${this.config.enabled ? 'YES' : 'NO'}\n`;
    if (this.config.enabled) {
      report += `Per-Test Schemas: ${this.config.usePerTestSchemas ? 'YES' : 'NO'}\n`;
      report += `Per-File Schemas: ${this.config.usePerFileSchemas ? 'YES' : 'NO'}\n`;
      report += `Schema Prefix: ${this.config.schemaPrefix}\n`;
      report += `Auto Cleanup: ${this.config.autoCleanup ? 'YES' : 'NO'}\n`;
      report += `Active Schemas: ${activeSchemas.length}\n\n`;
    }

    if (activeSchemas.length === 0) {
      report += 'No active schemas\n';
    } else {
      for (const schema of activeSchemas) {
        report += `📁 ${schema.name}\n`;
        report += `  Test File: ${schema.testFile}\n`;
        if (schema.testName) {
          report += `  Test Name: ${schema.testName}\n`;
        }
        report += `  Created: ${schema.createdAt.toLocaleString()}\n`;
        report += `  Migrated: ${schema.migrated ? 'YES' : 'NO'}\n`;
        report += `  Dedicated Pool: ${schema.connectionPool ? 'YES' : 'NO'}\n`;
        report += `  Entity Count: ${schema.entityCount}\n\n`;
      }
    }

    report += '═'.repeat(60) + '\n';
    return report;
  }

  static getConfiguration(): SchemaIsolationConfig {
    return { ...this.config };
  }
}

// Convenience functions
export function enableSchemaIsolation(config?: Partial<SchemaIsolationConfig>): void {
  SchemaIsolationSystem.configure({ enabled: true, ...config });
}

export function disableSchemaIsolation(): void {
  SchemaIsolationSystem.configure({ enabled: false });
}

export async function withIsolatedSchema<T>(
  testFile: string,
  testName: string,
  operation: (schemaName: string, leaseId: string) => Promise<T>
): Promise<T> {
  return SchemaIsolationSystem.withIsolatedSchema(testFile, testName, operation);
}

export function logSchemaStatus(): void {
  console.log(SchemaIsolationSystem.generateSchemaReport());
}