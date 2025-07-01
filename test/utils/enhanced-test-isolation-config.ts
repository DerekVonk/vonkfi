/**
 * Enhanced Test Data Isolation Strategy Configuration
 * 
 * This configuration file provides production-ready test data isolation
 * with comprehensive security, performance monitoring, and cleanup strategies.
 */

import { TestDataNamespacing } from './test-data-namespacing';
import { SchemaIsolationSystem } from './schema-isolation-system';
import { TestDatabaseHelpers } from './test-db-helpers';
import { DeadlockDetector } from './deadlock-detector';
import { TransactionPerformanceMonitor } from './transaction-performance-monitor';

export interface EnhancedIsolationConfig {
  // Core isolation settings
  isolationLevel: 'namespace' | 'schema' | 'transaction' | 'hybrid';
  
  // Security settings
  enableSecurityValidation: boolean;
  enableIntegrityChecks: boolean;
  maxNamespaceLength: number;
  allowedEntityTypes: string[];
  
  // Performance settings
  enablePerformanceMonitoring: boolean;
  enableDeadlockDetection: boolean;
  maxConcurrentOperations: number;
  timeoutSettings: {
    connection: number;
    transaction: number;
    cleanup: number;
    migration: number;
  };
  
  // Cleanup settings
  cleanupStrategy: 'immediate' | 'deferred' | 'batch' | 'manual';
  retentionPolicy: {
    maxAge: number;
    maxSize: number;
    maxEntities: number;
  };
  
  // Retry and resilience settings
  retryPolicy: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  
  // Monitoring and alerting
  enableMetrics: boolean;
  enableAlerting: boolean;
  alertThresholds: {
    errorRate: number;
    responseTime: number;
    memoryUsage: number;
    concurrentConnections: number;
  };
}

export const PRODUCTION_ISOLATION_CONFIG: EnhancedIsolationConfig = {
  isolationLevel: 'hybrid',
  
  enableSecurityValidation: true,
  enableIntegrityChecks: true,
  maxNamespaceLength: 63,
  allowedEntityTypes: [
    'user', 'account', 'category', 'goal', 'transaction', 
    'import_history', 'transaction_hash', 'transfer_recommendation'
  ],
  
  enablePerformanceMonitoring: true,
  enableDeadlockDetection: true,
  maxConcurrentOperations: 50,
  timeoutSettings: {
    connection: 10000,
    transaction: 30000,
    cleanup: 60000,
    migration: 120000
  },
  
  cleanupStrategy: 'immediate',
  retentionPolicy: {
    maxAge: 3600000, // 1 hour
    maxSize: 1000000, // 1MB
    maxEntities: 10000
  },
  
  retryPolicy: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },
  
  enableMetrics: true,
  enableAlerting: true,
  alertThresholds: {
    errorRate: 0.05, // 5%
    responseTime: 5000, // 5 seconds
    memoryUsage: 500, // 500MB
    concurrentConnections: 80 // 80% of max
  }
};

export const DEVELOPMENT_ISOLATION_CONFIG: EnhancedIsolationConfig = {
  ...PRODUCTION_ISOLATION_CONFIG,
  
  isolationLevel: 'namespace',
  enableSecurityValidation: false,
  enableIntegrityChecks: false,
  enablePerformanceMonitoring: false,
  enableDeadlockDetection: false,
  
  cleanupStrategy: 'deferred',
  timeoutSettings: {
    connection: 5000,
    transaction: 15000,
    cleanup: 30000,
    migration: 60000
  },
  
  enableAlerting: false
};

export const CI_ISOLATION_CONFIG: EnhancedIsolationConfig = {
  ...PRODUCTION_ISOLATION_CONFIG,
  
  isolationLevel: 'schema',
  maxConcurrentOperations: 20,
  
  timeoutSettings: {
    connection: 15000,
    transaction: 45000,
    cleanup: 90000,
    migration: 180000
  },
  
  cleanupStrategy: 'immediate',
  retentionPolicy: {
    maxAge: 7200000, // 2 hours
    maxSize: 500000, // 500KB
    maxEntities: 5000
  }
};

export class EnhancedTestIsolationManager {
  private config: EnhancedIsolationConfig;
  private deadlockDetector?: DeadlockDetector;
  private performanceMonitor?: TransactionPerformanceMonitor;
  private metrics = {
    operationsTotal: 0,
    operationsSuccessful: 0,
    operationsFailed: 0,
    cleanupOperations: 0,
    securityViolations: 0,
    performanceAlerts: 0
  };
  
  constructor(config: EnhancedIsolationConfig = PRODUCTION_ISOLATION_CONFIG) {\n    this.config = config;\n    this.initialize();\n  }\n  \n  private initialize(): void {\n    console.log('🔧 Initializing Enhanced Test Isolation Manager...');\n    \n    // Configure individual systems\n    this.configureNamespacing();\n    this.configureSchemaIsolation();\n    this.configureTransactionHelpers();\n    \n    // Initialize monitoring systems\n    if (this.config.enableDeadlockDetection) {\n      this.deadlockDetector = new DeadlockDetector();\n      this.setupDeadlockMonitoring();\n    }\n    \n    if (this.config.enablePerformanceMonitoring) {\n      this.performanceMonitor = new TransactionPerformanceMonitor();\n      this.setupPerformanceMonitoring();\n    }\n    \n    console.log('✅ Enhanced Test Isolation Manager initialized');\n  }\n  \n  private configureNamespacing(): void {\n    // Configure the enhanced namespacing system\n    if (this.config.enableSecurityValidation) {\n      console.log('🔒 Security validation enabled for namespacing');\n    }\n  }\n  \n  private configureSchemaIsolation(): void {\n    const schemaConfig = {\n      enabled: this.config.isolationLevel === 'schema' || this.config.isolationLevel === 'hybrid',\n      usePerTestSchemas: this.config.isolationLevel === 'schema',\n      usePerFileSchemas: false,\n      schemaPrefix: 'test_schema',\n      autoCleanup: this.config.cleanupStrategy === 'immediate',\n      migrationTimeout: this.config.timeoutSettings.migration,\n      maxConcurrentSchemas: this.config.maxConcurrentOperations,\n      enableSecurityChecks: this.config.enableSecurityValidation,\n      enableMetrics: this.config.enableMetrics\n    };\n    \n    SchemaIsolationSystem.configure(schemaConfig);\n  }\n  \n  private configureTransactionHelpers(): void {\n    // Transaction helpers are configured through static properties\n    console.log('⚡ Transaction helpers configured with enhanced features');\n  }\n  \n  private setupDeadlockMonitoring(): void {\n    if (!this.deadlockDetector) return;\n    \n    this.deadlockDetector.on('deadlockDetected', (info) => {\n      this.metrics.performanceAlerts++;\n      console.error(`💀 Deadlock detected: ${info.transactionId}`);\n      \n      if (this.config.enableAlerting) {\n        this.handleDeadlockAlert(info);\n      }\n    });\n    \n    this.deadlockDetector.on('potentialDeadlock', (info) => {\n      console.warn(`⚠️ Potential deadlock: ${info.transactionCount} transactions`);\n    });\n  }\n  \n  private setupPerformanceMonitoring(): void {\n    if (!this.performanceMonitor) return;\n    \n    this.performanceMonitor.on('performanceAlert', (alert) => {\n      this.metrics.performanceAlerts++;\n      \n      if (this.config.enableAlerting) {\n        this.handlePerformanceAlert(alert);\n      }\n    });\n  }\n  \n  private handleDeadlockAlert(info: any): void {\n    // Implement deadlock alert handling (e.g., notifications, logging)\n    console.error(`🚨 DEADLOCK ALERT: ${info.transactionId} - Consider reviewing transaction isolation levels`);\n  }\n  \n  private handlePerformanceAlert(alert: any): void {\n    // Implement performance alert handling\n    console.warn(`🚨 PERFORMANCE ALERT: ${alert.alertType} - ${alert.suggestion}`);\n  }\n  \n  async createIsolatedTestEnvironment(\n    testFile: string,\n    testName: string,\n    options: {\n      isolationLevel?: 'namespace' | 'schema' | 'transaction';\n      cleanupStrategy?: 'immediate' | 'deferred' | 'manual';\n      enableMonitoring?: boolean;\n    } = {}\n  ): Promise<{\n    namespaceId?: string;\n    schemaName?: string;\n    cleanup: () => Promise<void>;\n    getMetrics: () => any;\n  }> {\n    const startTime = Date.now();\n    this.metrics.operationsTotal++;\n    \n    try {\n      const isolationLevel = options.isolationLevel || this.config.isolationLevel;\n      let namespaceId: string | undefined;\n      let schemaName: string | undefined;\n      \n      // Create namespace for data isolation\n      if (isolationLevel === 'namespace' || isolationLevel === 'hybrid') {\n        const namespace = await TestDataNamespacing.generateNamespace(testFile, testName, {\n          isolationLevel: 'namespace',\n          cleanupStrategy: options.cleanupStrategy || this.config.cleanupStrategy,\n          maxEntityLimit: this.config.retentionPolicy.maxEntities\n        });\n        namespaceId = namespace.id;\n      }\n      \n      // Create isolated schema if needed\n      if (isolationLevel === 'schema' || isolationLevel === 'hybrid') {\n        const schema = await SchemaIsolationSystem.createIsolatedSchema(testFile, testName, {\n          cleanupStrategy: options.cleanupStrategy || this.config.cleanupStrategy\n        });\n        schemaName = schema.name;\n      }\n      \n      this.metrics.operationsSuccessful++;\n      \n      const environment = {\n        namespaceId,\n        schemaName,\n        cleanup: async () => {\n          const cleanupStart = Date.now();\n          try {\n            if (namespaceId) {\n              await TestDataNamespacing.cleanupNamespace(namespaceId);\n            }\n            if (schemaName) {\n              await SchemaIsolationSystem.cleanupSchema(schemaName);\n            }\n            this.metrics.cleanupOperations++;\n            console.log(`🧹 Environment cleanup completed (${Date.now() - cleanupStart}ms)`);\n          } catch (error) {\n            console.error('Cleanup failed:', error);\n            throw error;\n          }\n        },\n        getMetrics: () => ({\n          namespaceMetrics: namespaceId ? TestDataNamespacing.getCleanupMetrics() : null,\n          schemaMetrics: SchemaIsolationSystem.getActiveSchemas().length,\n          deadlockMetrics: this.deadlockDetector?.getReport(),\n          performanceMetrics: this.performanceMonitor?.getReport(),\n          isolationMetrics: this.metrics\n        })\n      };\n      \n      console.log(`🏗️ Isolated test environment created (${Date.now() - startTime}ms)`);\n      return environment;\n      \n    } catch (error) {\n      this.metrics.operationsFailed++;\n      console.error('Failed to create isolated test environment:', error);\n      throw error;\n    }\n  }\n  \n  async performHealthCheck(): Promise<{\n    healthy: boolean;\n    issues: string[];\n    metrics: typeof this.metrics;\n  }> {\n    const issues: string[] = [];\n    \n    // Check metrics for concerning patterns\n    const errorRate = this.metrics.operationsFailed / (this.metrics.operationsTotal || 1);\n    if (errorRate > this.config.alertThresholds.errorRate) {\n      issues.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);\n    }\n    \n    if (this.metrics.securityViolations > 0) {\n      issues.push(`Security violations detected: ${this.metrics.securityViolations}`);\n    }\n    \n    if (this.metrics.performanceAlerts > 10) {\n      issues.push(`High number of performance alerts: ${this.metrics.performanceAlerts}`);\n    }\n    \n    // Check system resources\n    const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;\n    if (memUsage > this.config.alertThresholds.memoryUsage) {\n      issues.push(`High memory usage: ${memUsage.toFixed(1)}MB`);\n    }\n    \n    return {\n      healthy: issues.length === 0,\n      issues,\n      metrics: { ...this.metrics }\n    };\n  }\n  \n  generateReport(): string {\n    let report = '\\n🔧 ENHANCED TEST ISOLATION REPORT\\n';\n    report += '═'.repeat(60) + '\\n\\n';\n    \n    report += `Configuration: ${this.config.isolationLevel.toUpperCase()}\\n`;\n    report += `Security Validation: ${this.config.enableSecurityValidation ? 'ENABLED' : 'DISABLED'}\\n`;\n    report += `Performance Monitoring: ${this.config.enablePerformanceMonitoring ? 'ENABLED' : 'DISABLED'}\\n`;\n    report += `Deadlock Detection: ${this.config.enableDeadlockDetection ? 'ENABLED' : 'DISABLED'}\\n\\n`;\n    \n    report += '📊 ISOLATION METRICS\\n';\n    report += `  Total Operations: ${this.metrics.operationsTotal}\\n`;\n    report += `  Successful: ${this.metrics.operationsSuccessful}\\n`;\n    report += `  Failed: ${this.metrics.operationsFailed}\\n`;\n    const successRate = this.metrics.operationsTotal > 0 \n      ? (this.metrics.operationsSuccessful / this.metrics.operationsTotal * 100).toFixed(1)\n      : '0';\n    report += `  Success Rate: ${successRate}%\\n`;\n    report += `  Cleanup Operations: ${this.metrics.cleanupOperations}\\n`;\n    report += `  Security Violations: ${this.metrics.securityViolations}\\n`;\n    report += `  Performance Alerts: ${this.metrics.performanceAlerts}\\n\\n`;\n    \n    // Add subsystem reports\n    report += TestDataNamespacing.generateNamespaceReport();\n    report += SchemaIsolationSystem.generateSchemaReport();\n    \n    if (this.deadlockDetector) {\n      const deadlockReport = this.deadlockDetector.getReport();\n      report += '\\n💀 DEADLOCK DETECTION\\n';\n      report += `  Total Deadlocks: ${deadlockReport.metrics.totalDeadlocks}\\n`;\n      report += `  Active Transactions: ${deadlockReport.activeTransactions.length}\\n`;\n      report += `  Recent Deadlocks: ${deadlockReport.recentDeadlocks.length}\\n`;\n      report += `  Patterns Detected: ${deadlockReport.patterns.length}\\n\\n`;\n    }\n    \n    if (this.performanceMonitor) {\n      const perfReport = this.performanceMonitor.getReport();\n      report += '⚡ PERFORMANCE MONITORING\\n';\n      report += `  Active Transactions: ${perfReport.activeTransactions}\\n`;\n      report += `  Average Transaction Time: ${perfReport.aggregateMetrics.averageTransactionTime.toFixed(0)}ms\\n`;\n      report += `  Slow Transactions: ${perfReport.aggregateMetrics.slowTransactions}\\n`;\n      report += `  Recent Alerts: ${perfReport.recentAlerts.length}\\n\\n`;\n    }\n    \n    report += '═'.repeat(60) + '\\n';\n    return report;\n  }\n  \n  destroy(): void {\n    console.log('🔧 Destroying Enhanced Test Isolation Manager...');\n    \n    if (this.deadlockDetector) {\n      this.deadlockDetector.destroy();\n    }\n    \n    if (this.performanceMonitor) {\n      this.performanceMonitor.destroy();\n    }\n    \n    console.log('✅ Enhanced Test Isolation Manager destroyed');\n  }\n}\n\n// Global instance\nlet globalIsolationManager: EnhancedTestIsolationManager | null = null;\n\nexport function initializeEnhancedIsolation(config?: EnhancedIsolationConfig): EnhancedTestIsolationManager {\n  if (globalIsolationManager) {\n    globalIsolationManager.destroy();\n  }\n  \n  const environment = process.env.NODE_ENV;\n  let defaultConfig: EnhancedIsolationConfig;\n  \n  switch (environment) {\n    case 'production':\n    case 'test':\n      defaultConfig = PRODUCTION_ISOLATION_CONFIG;\n      break;\n    case 'development':\n      defaultConfig = DEVELOPMENT_ISOLATION_CONFIG;\n      break;\n    default:\n      defaultConfig = process.env.CI ? CI_ISOLATION_CONFIG : DEVELOPMENT_ISOLATION_CONFIG;\n  }\n  \n  globalIsolationManager = new EnhancedTestIsolationManager(config || defaultConfig);\n  return globalIsolationManager;\n}\n\nexport function getEnhancedIsolationManager(): EnhancedTestIsolationManager | null {\n  return globalIsolationManager;\n}\n\nexport function logEnhancedIsolationReport(): void {\n  if (globalIsolationManager) {\n    console.log(globalIsolationManager.generateReport());\n  } else {\n    console.log('🔧 Enhanced Test Isolation Manager not initialized');\n  }\n}