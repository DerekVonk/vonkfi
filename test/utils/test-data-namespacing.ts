import { TestConnectionPoolManager } from './connection-pool-manager';
import { poolManager } from '../setup';
// Using crypto for UUID generation instead of uuid package
import { randomBytes, createHash } from 'crypto';
import { EventEmitter } from 'events';
import { promisify } from 'util';

export interface TestNamespace {
  id: string;
  testFile: string;
  testName: string;
  createdAt: Date;
  prefix: string;
  entityCount: number;
  isActive: boolean;
  // Enhanced security and tracking
  version: string;
  processId: number;
  sessionId: string;
  isolationLevel: 'namespace' | 'schema' | 'transaction';
  cleanupStrategy: 'immediate' | 'deferred' | 'manual';
  dependencies: string[];
  locks: Set<string>;
  lastAccessed: Date;
  maxEntityLimit: number;
  securityHash: string;
}

export interface NamespacedEntity {
  originalName: string;
  namespacedName: string;
  entityType: string;
  namespace: string;
  // Enhanced tracking and validation
  id: number;
  createdAt: Date;
  lastModified: Date;
  version: number;
  checksum: string;
  foreignKeys: Array<{table: string, column: string, referencedTable: string, referencedColumn: string}>;
  isTemporary: boolean;
  dataSize: number;
  accessCount: number;
}

export class TestDataNamespacing extends EventEmitter {
  private static activeNamespaces = new Map<string, TestNamespace>();
  private static namespacedEntities = new Map<string, NamespacedEntity[]>();
  private static globalRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Enhanced state management and security
  private static namespaceLocks = new Map<string, Promise<void>>();
  private static cleanupQueue = new Set<string>();
  private static entityIdCounter = 1;
  private static maxNamespaces = 100;
  private static maxEntitiesPerNamespace = 10000;
  private static securityValidator = new SecurityValidator();
  private static dependencyGraph = new Map<string, Set<string>>();
  private static cleanupMetrics = {
    totalCleanups: 0,
    successfulCleanups: 0,
    failedCleanups: 0,
    averageCleanupTime: 0,
    lastCleanupTime: new Date()
  };
  private static retryPolicy = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  static async generateNamespace(
    testFile: string, 
    testName: string,
    options: {
      isolationLevel?: 'namespace' | 'schema' | 'transaction';
      cleanupStrategy?: 'immediate' | 'deferred' | 'manual';
      maxEntityLimit?: number;
      dependencies?: string[];
    } = {}
  ): Promise<TestNamespace> {
    // Enhanced input validation and sanitization
    if (!testFile || !testName) {
      throw new Error('testFile and testName are required');
    }
    
    // Security validation
    this.securityValidator.validateInput(testFile);
    this.securityValidator.validateInput(testName);
    
    // Check namespace limits
    if (this.activeNamespaces.size >= this.maxNamespaces) {
      await this.performEmergencyCleanup();
      if (this.activeNamespaces.size >= this.maxNamespaces) {
        throw new Error(`Maximum namespace limit reached: ${this.maxNamespaces}`);
      }
    }
    
    const id = this.generateSecureId();
    const cleanTestFile = this.sanitizeIdentifier(testFile).substring(0, 10);
    const cleanTestName = this.sanitizeIdentifier(testName).substring(0, 15);
    const sessionId = this.generateSessionId();
    const prefix = `test_${this.globalRunId}_${cleanTestFile}_${cleanTestName}_${id}`;
    
    // Generate security hash for integrity verification
    const securityHash = this.generateSecurityHash(prefix, testFile, testName);
    
    const namespace: TestNamespace = {
      id,
      testFile,
      testName,
      createdAt: new Date(),
      prefix,
      entityCount: 0,
      isActive: true,
      version: '1.0.0',
      processId: process.pid,
      sessionId,
      isolationLevel: options.isolationLevel || 'namespace',
      cleanupStrategy: options.cleanupStrategy || 'immediate',
      dependencies: options.dependencies || [],
      locks: new Set<string>(),
      lastAccessed: new Date(),
      maxEntityLimit: options.maxEntityLimit || this.maxEntitiesPerNamespace,
      securityHash
    };

    // Set up dependency tracking
    if (namespace.dependencies.length > 0) {
      this.dependencyGraph.set(id, new Set(namespace.dependencies));
    }

    this.activeNamespaces.set(id, namespace);
    this.namespacedEntities.set(id, []);
    
    console.log(`🏷️ Created secure namespace ${prefix} for ${testFile}:${testName} (isolation: ${namespace.isolationLevel})`);
    
    this.emit('namespaceCreated', {
      namespaceId: id,
      testFile,
      testName,
      isolationLevel: namespace.isolationLevel,
      timestamp: new Date()
    });
    
    return namespace;
  }

  static async addNamespacedEntity(
    namespaceId: string, 
    originalName: string, 
    entityType: string,
    options: {
      foreignKeys?: Array<{table: string, column: string, referencedTable: string, referencedColumn: string}>;
      isTemporary?: boolean;
      expectedDataSize?: number;
    } = {}
  ): Promise<string> {
    // Acquire namespace lock to prevent race conditions
    await this.acquireNamespaceLock(namespaceId);
    
    try {
      const namespace = this.activeNamespaces.get(namespaceId);
      if (!namespace) {
        throw new Error(`Namespace ${namespaceId} not found`);
      }
      
      // Verify namespace integrity
      if (!this.verifyNamespaceIntegrity(namespace)) {
        throw new Error(`Namespace integrity check failed: ${namespaceId}`);
      }
      
      // Check entity limits
      if (namespace.entityCount >= namespace.maxEntityLimit) {
        throw new Error(`Entity limit exceeded for namespace ${namespaceId}: ${namespace.maxEntityLimit}`);
      }
      
      // Security validation
      this.securityValidator.validateEntityName(originalName);
      this.securityValidator.validateEntityType(entityType);

      const namespacedName = `${namespace.prefix}_${this.sanitizeIdentifier(originalName)}`;
      
      // Generate entity checksum for integrity verification
      const checksum = this.generateEntityChecksum(namespacedName, entityType, options);
      
      const entity: NamespacedEntity = {
        originalName,
        namespacedName,
        entityType,
        namespace: namespaceId,
        id: this.entityIdCounter++,
        createdAt: new Date(),
        lastModified: new Date(),
        version: 1,
        checksum,
        foreignKeys: options.foreignKeys || [],
        isTemporary: options.isTemporary || false,
        dataSize: options.expectedDataSize || 0,
        accessCount: 0
      };

      const entities = this.namespacedEntities.get(namespaceId) || [];
      entities.push(entity);
      this.namespacedEntities.set(namespaceId, entities);
      
      namespace.entityCount++;
      namespace.lastAccessed = new Date();
      
      // Track foreign key dependencies
      if (entity.foreignKeys.length > 0) {
        this.updateDependencyGraph(namespaceId, entity);
      }
      
      console.log(`🏷️ Added entity ${namespacedName} to namespace ${namespace.prefix}`);
      
      this.emit('entityAdded', {
        namespaceId,
        entityId: entity.id,
        entityType,
        namespacedName,
        timestamp: new Date()
      });
      
      return namespacedName;
    } finally {
      this.releaseNamespaceLock(namespaceId);
    }
  }

  static async createNamespacedUser(
    namespaceId: string, 
    username: string, 
    password: string = 'test123',
    leaseId?: string
  ): Promise<{id: number, username: string}> {
    const namespacedUsername = this.addNamespacedEntity(namespaceId, username, 'user');
    
    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const client = leaseId ? poolManager.getClient(leaseId) : await poolManager.acquireLease('namespacing', 'createUser');
    
    try {
      const result = await client.query(`
        INSERT INTO users (username, password_hash, created_at)
        VALUES ($1, $2, NOW())
        RETURNING id, username
      `, [namespacedUsername, password]);

      const user = result.rows[0];
      console.log(`👤 Created namespaced user: ${user.username} (id: ${user.id})`);
      return user;
    } finally {
      if (!leaseId) {
        poolManager.releaseLease('createUser');
      }
    }
  }

  static async createNamespacedAccount(
    namespaceId: string,
    userId: number,
    accountName: string,
    iban?: string,
    leaseId?: string
  ): Promise<{id: number, custom_name: string, iban: string}> {
    const namespacedAccountName = this.addNamespacedEntity(namespaceId, accountName, 'account');
    const namespace = this.activeNamespaces.get(namespaceId)!;
    const namespacedIban = iban || `NL91TEST${namespace.prefix.substr(-10).padStart(10, '0')}`;
    
    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const client = leaseId ? poolManager.getClient(leaseId) : await poolManager.acquireLease('namespacing', 'createAccount');
    
    try {
      const result = await client.query(`
        INSERT INTO accounts (user_id, iban, account_holder_name, custom_name, balance, role, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, custom_name, iban
      `, [userId, namespacedIban, namespacedAccountName, namespacedAccountName, 1000.00, 'income']);

      const account = result.rows[0];
      console.log(`🏦 Created namespaced account: ${account.custom_name} (${account.iban})`);
      return account;
    } finally {
      if (!leaseId) {
        poolManager.releaseLease('createAccount');
      }
    }
  }

  static async createNamespacedCategory(
    namespaceId: string,
    categoryName: string,
    type: 'income' | 'expense' = 'expense',
    leaseId?: string
  ): Promise<{id: number, name: string}> {
    const namespacedCategoryName = this.addNamespacedEntity(namespaceId, categoryName, 'category');
    
    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const client = leaseId ? poolManager.getClient(leaseId) : await poolManager.acquireLease('namespacing', 'createCategory');
    
    try {
      const result = await client.query(`
        INSERT INTO categories (name, type, icon, color, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, name
      `, [namespacedCategoryName, type, '🏷️', '#6366f1']);

      const category = result.rows[0];
      console.log(`🏷️ Created namespaced category: ${category.name}`);
      return category;
    } finally {
      if (!leaseId) {
        poolManager.releaseLease('createCategory');
      }
    }
  }

  static async createNamespacedGoal(
    namespaceId: string,
    userId: number,
    goalName: string,
    targetAmount: number = 1000,
    leaseId?: string
  ): Promise<{id: number, name: string}> {
    const namespacedGoalName = this.addNamespacedEntity(namespaceId, goalName, 'goal');
    
    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const client = leaseId ? poolManager.getClient(leaseId) : await poolManager.acquireLease('namespacing', 'createGoal');
    
    try {
      const result = await client.query(`
        INSERT INTO goals (user_id, name, target_amount, current_amount, priority, target_date, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, name
      `, [userId, namespacedGoalName, targetAmount, 0, 'medium', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)]);

      const goal = result.rows[0];
      console.log(`🎯 Created namespaced goal: ${goal.name}`);
      return goal;
    } finally {
      if (!leaseId) {
        poolManager.releaseLease('createGoal');
      }
    }
  }

  static async createTestDataSet(
    namespaceId: string,
    config: {
      userCount?: number;
      accountsPerUser?: number;
      categoryCount?: number;
      goalsPerUser?: number;
    } = {},
    leaseId?: string
  ): Promise<{
    users: any[],
    accounts: any[],
    categories: any[],
    goals: any[]
  }> {
    const {
      userCount = 1,
      accountsPerUser = 2,
      categoryCount = 3,
      goalsPerUser = 2
    } = config;

    const users = [];
    const accounts = [];
    const categories = [];
    const goals = [];

    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const ownedLease = !leaseId;
    const actualLeaseId = leaseId || await poolManager.acquireLease('namespacing', 'createTestDataSet');
    
    try {
      // Create categories first (they're referenced by transactions)
      for (let i = 0; i < categoryCount; i++) {
        const category = await this.createNamespacedCategory(
          namespaceId,
          `Category${i + 1}`,
          i % 2 === 0 ? 'expense' : 'income',
          actualLeaseId
        );
        categories.push(category);
      }

      // Create users and their related data
      for (let i = 0; i < userCount; i++) {
        const user = await this.createNamespacedUser(
          namespaceId,
          `user${i + 1}`,
          'test123',
          actualLeaseId
        );
        users.push(user);

        // Create accounts for each user
        for (let j = 0; j < accountsPerUser; j++) {
          const account = await this.createNamespacedAccount(
            namespaceId,
            user.id,
            `Account${j + 1}`,
            undefined,
            actualLeaseId
          );
          accounts.push(account);
        }

        // Create goals for each user
        for (let k = 0; k < goalsPerUser; k++) {
          const goal = await this.createNamespacedGoal(
            namespaceId,
            user.id,
            `Goal${k + 1}`,
            (k + 1) * 1000,
            actualLeaseId
          );
          goals.push(goal);
        }
      }

      console.log(`📊 Created test data set for namespace ${namespaceId}: ${users.length} users, ${accounts.length} accounts, ${categories.length} categories, ${goals.length} goals`);

      return { users, accounts, categories, goals };
    } finally {
      if (ownedLease) {
        poolManager.releaseLease(actualLeaseId);
      }
    }
  }

  static async cleanupNamespace(namespaceId: string, leaseId?: string): Promise<void> {
    const namespace = this.activeNamespaces.get(namespaceId);
    if (!namespace) {
      console.warn(`Namespace ${namespaceId} not found for cleanup`);
      return;
    }

    if (!poolManager) {
      throw new Error('Pool manager not available');
    }

    const ownedLease = !leaseId;
    const actualLeaseId = leaseId || await poolManager.acquireLease('namespacing', 'cleanupNamespace');
    
    try {
      const client = poolManager.getClient(actualLeaseId);
      
      console.log(`🧹 Cleaning up namespace ${namespace.prefix}...`);
      
      // Clean up in dependency order (reverse of creation)
      const tables = [
        'transaction_hashes',
        'transfer_recommendations',
        'goals',
        'transactions',
        'accounts',
        'import_history',
        'users',
        'categories'
      ];

      let totalDeleted = 0;
      
      for (const table of tables) {
        try {
          let result;
          
          if (table === 'users') {
            result = await client.query(`DELETE FROM ${table} WHERE username LIKE $1`, [`${namespace.prefix}_%`]);
          } else if (table === 'categories') {
            result = await client.query(`DELETE FROM ${table} WHERE name LIKE $1`, [`${namespace.prefix}_%`]);
          } else if (table === 'accounts') {
            result = await client.query(`DELETE FROM ${table} WHERE custom_name LIKE $1`, [`${namespace.prefix}_%`]);
          } else if (table === 'goals') {
            result = await client.query(`DELETE FROM ${table} WHERE name LIKE $1`, [`${namespace.prefix}_%`]);
          } else {
            // For other tables, rely on CASCADE deletes from parent tables
            continue;
          }
          
          if (result.rowCount > 0) {
            totalDeleted += result.rowCount;
            console.log(`  ✅ Deleted ${result.rowCount} rows from ${table}`);
          }
        } catch (error) {
          console.warn(`  ⚠️ Failed to clean ${table}:`, error.message);
        }
      }

      namespace.isActive = false;
      console.log(`✅ Namespace cleanup completed: ${totalDeleted} total rows deleted`);
      
    } finally {
      if (ownedLease) {
        poolManager.releaseLease(actualLeaseId);
      }
    }
  }

  static async cleanupAllNamespaces(): Promise<void> {
    const activeNamespaces = Array.from(this.activeNamespaces.values())
      .filter(ns => ns.isActive);

    console.log(`🧹 Cleaning up ${activeNamespaces.length} active namespaces...`);

    for (const namespace of activeNamespaces) {
      try {
        await this.cleanupNamespace(namespace.id);
      } catch (error) {
        console.error(`Failed to cleanup namespace ${namespace.id}:`, error);
      }
    }

    this.activeNamespaces.clear();
    this.namespacedEntities.clear();
  }

  static getNamespaceInfo(namespaceId: string): TestNamespace | undefined {
    return this.activeNamespaces.get(namespaceId);
  }

  static getActiveNamespaces(): TestNamespace[] {
    return Array.from(this.activeNamespaces.values()).filter(ns => ns.isActive);
  }

  static getNamespacedEntities(namespaceId: string): NamespacedEntity[] {
    return this.namespacedEntities.get(namespaceId) || [];
  }

  static generateNamespaceReport(): string {
    const activeNamespaces = this.getActiveNamespaces();
    
    let report = '\n🏷️ TEST DATA NAMESPACING REPORT\n';
    report += '═'.repeat(60) + '\n\n';
    
    report += `Global Run ID: ${this.globalRunId}\n`;
    report += `Active Namespaces: ${activeNamespaces.length}\n\n`;

    if (activeNamespaces.length === 0) {
      report += 'No active namespaces\n';
    } else {
      for (const namespace of activeNamespaces) {
        const entities = this.getNamespacedEntities(namespace.id);
        const entityTypes = entities.reduce((acc, entity) => {
          acc[entity.entityType] = (acc[entity.entityType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        report += `📁 ${namespace.prefix}\n`;
        report += `  Test: ${namespace.testFile}:${namespace.testName}\n`;
        report += `  Created: ${namespace.createdAt.toLocaleString()}\n`;
        report += `  Entities: ${namespace.entityCount}\n`;
        report += `  Types: ${Object.entries(entityTypes).map(([type, count]) => `${type}(${count})`).join(', ')}\n\n`;
      }
    }

    report += '═'.repeat(60) + '\n';
    return report;
  }

  static getGlobalRunId(): string {
    return this.globalRunId;
  }
}

// Convenience functions
export function createTestNamespace(testFile: string, testName: string): TestNamespace {
  return TestDataNamespacing.generateNamespace(testFile, testName);
}

export function cleanupTestNamespace(namespaceId: string): Promise<void> {
  return TestDataNamespacing.cleanupNamespace(namespaceId);
}

export function createTestDataSet(namespaceId: string, config?: any): Promise<any> {
  return TestDataNamespacing.createTestDataSet(namespaceId, config);
}

export function logNamespaceReport(): void {
  console.log(TestDataNamespacing.generateNamespaceReport());
}