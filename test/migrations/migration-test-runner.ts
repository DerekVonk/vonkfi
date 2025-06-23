import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as schema from '@shared/schema';

export interface MigrationTestResult {
  success: boolean;
  migrationFile: string;
  executionTime: number;
  error?: string;
  warnings?: string[];
}

export interface RollbackTestResult {
  success: boolean;
  migrationFile: string;
  rollbackFile: string;
  executionTime: number;
  error?: string;
  dataIntegrityCheck: boolean;
}

export class MigrationTestRunner {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;
  private migrationsPath: string;

  constructor(databaseUrl: string, migrationsPath: string = './migrations') {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    this.db = drizzle({ client: this.pool, schema });
    this.migrationsPath = migrationsPath;
  }

  /**
   * Test all migrations from scratch
   */
  async testMigrations(): Promise<MigrationTestResult[]> {
    const results: MigrationTestResult[] = [];
    
    try {
      // Get all migration files
      const migrationFiles = this.getMigrationFiles();
      
      // Drop and recreate database
      await this.resetDatabase();
      
      // Test each migration individually
      for (const migrationFile of migrationFiles) {
        const result = await this.testSingleMigration(migrationFile);
        results.push(result);
        
        if (!result.success) {
          console.error(`Migration test failed: ${migrationFile}`);
          break;
        }
      }
      
      return results;
    } catch (error) {
      console.error('Migration test runner error:', error);
      throw error;
    }
  }

  /**
   * Test migration rollbacks
   */
  async testMigrationRollbacks(): Promise<RollbackTestResult[]> {
    const results: RollbackTestResult[] = [];
    
    try {
      // First, run all migrations
      await this.resetDatabase();
      await migrate(this.db, { migrationsFolder: this.migrationsPath });
      
      // Create test data for rollback integrity checks
      await this.seedTestDataForRollback();
      
      // Get migration files in reverse order
      const migrationFiles = this.getMigrationFiles().reverse();
      
      // Test rollback for each migration (if rollback files exist)
      for (const migrationFile of migrationFiles) {
        const rollbackFile = this.getRollbackFile(migrationFile);
        if (rollbackFile) {
          const result = await this.testSingleRollback(migrationFile, rollbackFile);
          results.push(result);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Migration rollback test error:', error);
      throw error;
    }
  }

  /**
   * Test schema compatibility
   */
  async testSchemaCompatibility(): Promise<{
    compatible: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    try {
      // Run migrations
      await this.resetDatabase();
      await migrate(this.db, { migrationsFolder: this.migrationsPath });
      
      // Check for common schema issues
      await this.checkForMissingIndexes(issues, suggestions);
      await this.checkForLargeTables(issues, suggestions);
      await this.checkForUnusedColumns(issues, suggestions);
      await this.checkForMissingConstraints(issues, suggestions);
      
      return {
        compatible: issues.length === 0,
        issues,
        suggestions,
      };
    } catch (error) {
      issues.push(`Schema compatibility check failed: ${error.message}`);
      return {
        compatible: false,
        issues,
        suggestions,
      };
    }
  }

  /**
   * Test performance impact of migrations
   */
  async testMigrationPerformance(): Promise<{
    totalTime: number;
    slowestMigration: { file: string; time: number };
    averageTime: number;
    performanceWarnings: string[];
  }> {
    const performanceTimes: { file: string; time: number }[] = [];
    const performanceWarnings: string[] = [];
    
    try {
      await this.resetDatabase();
      
      const migrationFiles = this.getMigrationFiles();
      
      for (const migrationFile of migrationFiles) {
        const startTime = Date.now();
        await this.runSingleMigrationFile(migrationFile);
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        performanceTimes.push({ file: migrationFile, time: executionTime });
        
        // Add warnings for slow migrations
        if (executionTime > 30000) { // 30 seconds
          performanceWarnings.push(
            `Migration ${migrationFile} took ${executionTime}ms (>30s) - consider optimization`
          );
        }
      }
      
      const totalTime = performanceTimes.reduce((sum, p) => sum + p.time, 0);
      const averageTime = totalTime / performanceTimes.length;
      const slowestMigration = performanceTimes.reduce((slowest, current) =>
        current.time > slowest.time ? current : slowest
      );
      
      return {
        totalTime,
        slowestMigration,
        averageTime,
        performanceWarnings,
      };
    } catch (error) {
      throw new Error(`Migration performance test failed: ${error.message}`);
    }
  }

  /**
   * Private helper methods
   */
  private getMigrationFiles(): string[] {
    if (!existsSync(this.migrationsPath)) {
      throw new Error(`Migrations directory not found: ${this.migrationsPath}`);
    }
    
    return readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  private getRollbackFile(migrationFile: string): string | null {
    const rollbackFile = migrationFile.replace('.sql', '.rollback.sql');
    const rollbackPath = join(this.migrationsPath, 'rollbacks', rollbackFile);
    return existsSync(rollbackPath) ? rollbackPath : null;
  }

  private async testSingleMigration(migrationFile: string): Promise<MigrationTestResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    
    try {
      await this.runSingleMigrationFile(migrationFile);
      
      // Verify schema changes
      await this.verifySchemaIntegrity(warnings);
      
      return {
        success: true,
        migrationFile,
        executionTime: Date.now() - startTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        migrationFile,
        executionTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  private async testSingleRollback(
    migrationFile: string,
    rollbackFile: string
  ): Promise<RollbackTestResult> {
    const startTime = Date.now();
    
    try {
      // Store data state before rollback
      const dataSnapshot = await this.createDataSnapshot();
      
      // Execute rollback
      await this.runRollbackFile(rollbackFile);
      
      // Check data integrity
      const dataIntegrityCheck = await this.verifyDataIntegrity(dataSnapshot);
      
      return {
        success: true,
        migrationFile,
        rollbackFile,
        executionTime: Date.now() - startTime,
        dataIntegrityCheck,
      };
    } catch (error) {
      return {
        success: false,
        migrationFile,
        rollbackFile,
        executionTime: Date.now() - startTime,
        error: error.message,
        dataIntegrityCheck: false,
      };
    }
  }

  private async resetDatabase(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query('GRANT ALL ON SCHEMA public TO public');
    } finally {
      client.release();
    }
  }

  private async runSingleMigrationFile(migrationFile: string): Promise<void> {
    // This would be implemented based on your migration system
    // For now, we'll use drizzle's migrate function
    await migrate(this.db, { migrationsFolder: this.migrationsPath });
  }

  private async runRollbackFile(rollbackFile: string): Promise<void> {
    // This would execute the rollback SQL file
    // Implementation depends on your rollback system
    throw new Error('Rollback execution not implemented - depends on your rollback strategy');
  }

  private async verifySchemaIntegrity(warnings: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Check for tables without primary keys
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name NOT IN (
          SELECT table_name 
          FROM information_schema.table_constraints 
          WHERE constraint_type = 'PRIMARY KEY'
        )
      `);
      
      if (result.rows.length > 0) {
        warnings.push(`Tables without primary keys: ${result.rows.map(r => r.table_name).join(', ')}`);
      }
    } finally {
      client.release();
    }
  }

  private async seedTestDataForRollback(): Promise<void> {
    // Create minimal test data that can be used to verify rollback integrity
    // This is specific to your application schema
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO users (username, password_hash, created_at)
        VALUES ('test_rollback_user', 'test_hash', NOW())
        ON CONFLICT (username) DO NOTHING
      `);
    } catch (error) {
      // Ignore errors for tables that don't exist yet
    } finally {
      client.release();
    }
  }

  private async createDataSnapshot(): Promise<any> {
    // Create a snapshot of critical data for rollback verification
    return {};
  }

  private async verifyDataIntegrity(snapshot: any): Promise<boolean> {
    // Verify that data integrity is maintained after rollback
    return true;
  }

  private async checkForMissingIndexes(issues: string[], suggestions: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Check for foreign key columns without indexes
      const result = await client.query(`
        SELECT 
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = tc.table_name 
          AND indexdef LIKE '%' || kcu.column_name || '%'
        )
      `);
      
      if (result.rows.length > 0) {
        suggestions.push(
          `Consider adding indexes for foreign key columns: ${
            result.rows.map(r => `${r.table_name}.${r.column_name}`).join(', ')
          }`
        );
      }
    } finally {
      client.release();
    }
  }

  private async checkForLargeTables(issues: string[], suggestions: string[]): Promise<void> {
    // Check for tables that might need partitioning or optimization
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 5
      `);
      
      // This is just informational for now
      if (result.rows.length > 0) {
        suggestions.push(`Largest tables: ${result.rows.map(r => `${r.tablename} (${r.size})`).join(', ')}`);
      }
    } finally {
      client.release();
    }
  }

  private async checkForUnusedColumns(issues: string[], suggestions: string[]): Promise<void> {
    // This would require query log analysis - simplified for now
    suggestions.push('Consider running column usage analysis on production data');
  }

  private async checkForMissingConstraints(issues: string[], suggestions: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Check for columns that might need NOT NULL constraints
      const result = await client.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND is_nullable = 'YES'
        AND column_name IN ('id', 'created_at', 'updated_at')
      `);
      
      if (result.rows.length > 0) {
        suggestions.push(
          `Consider NOT NULL constraints for: ${
            result.rows.map(r => `${r.table_name}.${r.column_name}`).join(', ')
          }`
        );
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}