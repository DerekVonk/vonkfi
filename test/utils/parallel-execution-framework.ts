import { EventEmitter } from 'events';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus, freemem, totalmem } from 'os';
import { performance } from 'perf_hooks';
import { TestConnectionPoolManager } from './connection-pool-manager';
import { TestDatabaseHelpers } from './test-db-helpers';
import { TestGroup, DatabaseDependencyLevel } from './test-parallelization-engine';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorkerConfiguration {
  id: number;
  maxMemoryMB: number;
  maxConcurrentTests: number;
  databaseConnectionLimit: number;
  isolationLevel: IsolationLevel;
  resourceMonitoring: boolean;
  heartbeatInterval: number;
  timeout: number;
}

export interface ResourceConstraints {
  maxTotalMemoryMB: number;
  maxConcurrentWorkers: number;
  maxDatabaseConnections: number;
  cpuThreshold: number; // CPU usage percentage threshold
  memoryThreshold: number; // Memory usage percentage threshold
  diskSpaceThreshold: number; // Disk space threshold in GB
}

export interface WorkerMetrics {
  workerId: number;
  status: WorkerStatus;
  currentTest: string | null;
  testsCompleted: number;
  testsFailures: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  databaseConnections: number;
  lastHeartbeat: Date;
  averageTestDuration: number;
  queueLength: number;
}

export interface ExecutionPlan {
  groups: TestGroup[];
  workerAssignments: Map<number, TestGroup[]>;
  resourceAllocation: ResourceAllocation;
  estimatedDuration: number;
  isolationStrategy: IsolationStrategy;
  fallbackPlan?: ExecutionPlan;
}

export interface ResourceAllocation {
  workerId: number;
  memoryMB: number;
  cpuCores: number[];
  databaseConnections: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  exclusiveResources: string[];
}

export interface TestExecutionResult {
  testFile: string;
  groupId: string;
  workerId: number;
  success: boolean;
  duration: number;
  memoryPeak: number;
  databaseOperations: number;
  isolationUsed: boolean;
  errors: string[];
  warnings: string[];
  metadata: Record<string, any>;
}

export enum WorkerStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  BUSY = 'busy',
  ERROR = 'error',
  SHUTTING_DOWN = 'shutting_down',
  TERMINATED = 'terminated'
}

export enum IsolationLevel {
  NONE = 'none',
  PROCESS = 'process',
  TRANSACTION = 'transaction',
  SCHEMA = 'schema',
  DATABASE = 'database'
}

export enum IsolationStrategy {
  CONSERVATIVE = 'conservative',
  BALANCED = 'balanced',
  AGGRESSIVE = 'aggressive',
  ADAPTIVE = 'adaptive'
}

export class ParallelExecutionFramework extends EventEmitter {
  private workers: Map<number, Worker> = new Map();
  private workerConfigs: Map<number, WorkerConfiguration> = new Map();
  private workerMetrics: Map<number, WorkerMetrics> = new Map();
  private resourceConstraints: ResourceConstraints;
  private poolManager: TestConnectionPoolManager | null = null;
  private executionQueue: TestGroup[] = [];
  private activeExecutions: Map<number, TestGroup> = new Map();
  private completedExecutions: TestExecutionResult[] = [];
  private failedExecutions: TestExecutionResult[] = [];
  private resourceMonitor: ResourceMonitor;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shutdownInProgress: boolean = false;
  private maxWorkers: number;
  private isolationStrategy: IsolationStrategy;
  
  // Enhanced enterprise-grade features
  private errorRecoverySystem: ErrorRecoverySystem;
  private performanceProfiler: PerformanceProfiler;
  private circuitBreaker: CircuitBreaker;
  private adaptiveThrottling: AdaptiveThrottling;
  private alertManager: AlertManager;
  private gracefulDegradation: GracefulDegradation;
  private workerRetryQueues: Map<number, TestGroup[]> = new Map();
  private globalErrorCount: number = 0;
  private lastHealthyState: Date = new Date();
  private executionHistory: ExecutionHistoryEntry[] = [];
  private resourceUtilizationHistory: ResourceUtilizationSnapshot[] = [];
  private deadlockDetector: DeadlockDetector;
  private memoryLeakDetector: MemoryLeakDetector;

  constructor(options: {
    maxWorkers?: number;
    resourceConstraints?: Partial<ResourceConstraints>;
    poolManager?: TestConnectionPoolManager;
    isolationStrategy?: IsolationStrategy;
    enableResourceMonitoring?: boolean;
  } = {}) {
    super();

    this.maxWorkers = options.maxWorkers || this.calculateOptimalWorkerCount();
    this.isolationStrategy = options.isolationStrategy || IsolationStrategy.BALANCED;
    this.poolManager = options.poolManager || null;

    this.resourceConstraints = {
      maxTotalMemoryMB: Math.floor(totalmem() / 1024 / 1024 * 0.8), // 80% of total memory
      maxConcurrentWorkers: this.maxWorkers,
      maxDatabaseConnections: 20,
      cpuThreshold: 85, // 85% CPU usage threshold
      memoryThreshold: 90, // 90% memory usage threshold
      diskSpaceThreshold: 5, // 5GB minimum disk space
      ...options.resourceConstraints
    };

    this.resourceMonitor = new ResourceMonitor(this.resourceConstraints);
    
    if (options.enableResourceMonitoring !== false) {
      this.startResourceMonitoring();
    }

    console.log(`🚀 Parallel Execution Framework initialized with ${this.maxWorkers} workers`);
    console.log(`📊 Resource Constraints:`, this.resourceConstraints);
  }

  private calculateOptimalWorkerCount(): number {
    const cpuCount = cpus().length;
    const totalMemoryGB = totalmem() / 1024 / 1024 / 1024;
    
    // Conservative calculation: 1 worker per 2 CPU cores, limited by memory
    const cpuBasedWorkers = Math.floor(cpuCount / 2);
    const memoryBasedWorkers = Math.floor(totalMemoryGB / 0.5); // 512MB per worker
    
    return Math.max(2, Math.min(cpuBasedWorkers, memoryBasedWorkers, 8));
  }

  /**
   * Initialize worker pool with optimal configuration
   */
  async initializeWorkers(): Promise<void> {
    console.log(`🔧 Initializing ${this.maxWorkers} workers...`);
    
    const workerPromises: Promise<void>[] = [];
    
    for (let i = 0; i < this.maxWorkers; i++) {
      workerPromises.push(this.createWorker(i));
    }

    await Promise.allSettled(workerPromises);
    this.startHeartbeatMonitoring();
    
    console.log(`✅ ${this.workers.size} workers initialized successfully`);
    this.emit('workersInitialized', this.workers.size);
  }

  private async createWorker(workerId: number): Promise<void> {
    try {
      const config = this.createWorkerConfiguration(workerId);
      
      const worker = new Worker(__filename, {
        workerData: {
          workerId,
          config,
          poolConfig: this.poolManager?.getMetrics() || null
        }
      });

      // Set up worker event handlers
      this.setupWorkerEventHandlers(worker, workerId);
      
      // Initialize worker metrics
      this.workerMetrics.set(workerId, {
        workerId,
        status: WorkerStatus.INITIALIZING,
        currentTest: null,
        testsCompleted: 0,
        testsFailures: 0,
        uptime: 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: 0,
        databaseConnections: 0,
        lastHeartbeat: new Date(),
        averageTestDuration: 0,
        queueLength: 0
      });

      this.workers.set(workerId, worker);
      this.workerConfigs.set(workerId, config);
      
      console.log(`👷 Worker ${workerId} created with config:`, config);
    } catch (error) {
      console.error(`Failed to create worker ${workerId}:`, error);
      throw error;
    }
  }

  private createWorkerConfiguration(workerId: number): WorkerConfiguration {
    const baseMemory = Math.floor(this.resourceConstraints.maxTotalMemoryMB / this.maxWorkers);
    const maxConnections = Math.floor(this.resourceConstraints.maxDatabaseConnections / this.maxWorkers);
    
    return {
      id: workerId,
      maxMemoryMB: Math.max(256, baseMemory),
      maxConcurrentTests: 3,
      databaseConnectionLimit: Math.max(1, maxConnections),
      isolationLevel: this.getWorkerIsolationLevel(workerId),
      resourceMonitoring: true,
      heartbeatInterval: 5000,
      timeout: 300000 // 5 minutes
    };
  }

  private getWorkerIsolationLevel(workerId: number): IsolationLevel {
    switch (this.isolationStrategy) {
      case IsolationStrategy.CONSERVATIVE:
        return IsolationLevel.TRANSACTION;
      case IsolationStrategy.BALANCED:
        return workerId < this.maxWorkers / 2 ? IsolationLevel.TRANSACTION : IsolationLevel.PROCESS;
      case IsolationStrategy.AGGRESSIVE:
        return IsolationLevel.PROCESS;
      case IsolationStrategy.ADAPTIVE:
        // Adaptive strategy based on worker load and system resources
        return this.resourceMonitor.isHighLoad() ? IsolationLevel.TRANSACTION : IsolationLevel.PROCESS;
      default:
        return IsolationLevel.PROCESS;
    }
  }

  private setupWorkerEventHandlers(worker: Worker, workerId: number): void {
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    worker.on('error', (error) => {
      console.error(`Worker ${workerId} error:`, error);
      this.handleWorkerError(workerId, error);
    });

    worker.on('exit', (code) => {
      console.warn(`Worker ${workerId} exited with code ${code}`);
      this.handleWorkerExit(workerId, code);
    });
  }

  private handleWorkerMessage(workerId: number, message: any): void {
    const metrics = this.workerMetrics.get(workerId);
    if (!metrics) return;

    switch (message.type) {
      case 'heartbeat':
        metrics.lastHeartbeat = new Date();
        metrics.status = message.status;
        metrics.memoryUsage = message.memoryUsage;
        metrics.cpuUsage = message.cpuUsage;
        break;

      case 'testCompleted':
        this.handleTestCompletion(workerId, message.result);
        break;

      case 'testFailed':
        this.handleTestFailure(workerId, message.result);
        break;

      case 'statusUpdate':
        metrics.status = message.status;
        metrics.currentTest = message.currentTest;
        break;

      case 'metricsUpdate':
        Object.assign(metrics, message.metrics);
        break;

      default:
        console.warn(`Unknown message type from worker ${workerId}:`, message.type);
    }

    this.emit('workerMessage', workerId, message);
  }

  private handleWorkerError(workerId: number, error: Error): void {
    const metrics = this.workerMetrics.get(workerId);
    if (metrics) {
      metrics.status = WorkerStatus.ERROR;
    }

    this.emit('workerError', workerId, error);
    
    // Attempt to restart worker if not shutting down
    if (!this.shutdownInProgress) {
      this.restartWorker(workerId);
    }
  }

  private handleWorkerExit(workerId: number, code: number): void {
    const metrics = this.workerMetrics.get(workerId);
    if (metrics) {
      metrics.status = WorkerStatus.TERMINATED;
    }

    this.emit('workerExit', workerId, code);
    
    // Clean up worker references
    this.workers.delete(workerId);
    
    // Restart worker if unexpected exit and not shutting down
    if (code !== 0 && !this.shutdownInProgress) {
      console.warn(`Worker ${workerId} exited unexpectedly, restarting...`);
      this.restartWorker(workerId);
    }
  }

  private async restartWorker(workerId: number): Promise<void> {
    try {
      // Wait a bit before restarting to avoid rapid restart cycles
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`🔄 Restarting worker ${workerId}...`);
      await this.createWorker(workerId);
      
      this.emit('workerRestarted', workerId);
    } catch (error) {
      console.error(`Failed to restart worker ${workerId}:`, error);
      this.emit('workerRestartFailed', workerId, error);
    }
  }

  private handleTestCompletion(workerId: number, result: TestExecutionResult): void {
    this.completedExecutions.push(result);
    
    const metrics = this.workerMetrics.get(workerId);
    if (metrics) {
      metrics.testsCompleted++;
      metrics.currentTest = null;
      metrics.status = WorkerStatus.IDLE;
      
      // Update average test duration
      const totalDuration = metrics.averageTestDuration * (metrics.testsCompleted - 1) + result.duration;
      metrics.averageTestDuration = totalDuration / metrics.testsCompleted;
    }

    this.emit('testCompleted', result);
    
    // Try to assign next test to this worker
    this.assignNextTest(workerId);
  }

  private handleTestFailure(workerId: number, result: TestExecutionResult): void {
    this.failedExecutions.push(result);
    
    const metrics = this.workerMetrics.get(workerId);
    if (metrics) {
      metrics.testsFailures++;
      metrics.currentTest = null;
      metrics.status = WorkerStatus.IDLE;
    }

    this.emit('testFailed', result);
    
    // Try to assign next test to this worker
    this.assignNextTest(workerId);
  }

  /**
   * Execute test groups with intelligent load balancing
   */
  async executeGroups(groups: TestGroup[]): Promise<ExecutionSummary> {
    console.log(`🚀 Starting parallel execution of ${groups.length} test groups...`);
    
    const startTime = performance.now();
    this.executionQueue = [...groups];
    
    // Create execution plan
    const executionPlan = this.createExecutionPlan(groups);
    console.log(`📋 Execution plan created:`, {
      totalGroups: executionPlan.groups.length,
      estimatedDuration: `${(executionPlan.estimatedDuration / 1000).toFixed(2)}s`,
      isolationStrategy: executionPlan.isolationStrategy
    });

    // Initialize workers if not already done
    if (this.workers.size === 0) {
      await this.initializeWorkers();
    }

    // Start execution
    await this.executeWithPlan(executionPlan);
    
    // Wait for all tests to complete
    await this.waitForCompletion();
    
    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    const summary = this.generateExecutionSummary(totalDuration);
    console.log(`✅ Parallel execution completed in ${(totalDuration / 1000).toFixed(2)}s`);
    
    this.emit('executionCompleted', summary);
    return summary;
  }

  private createExecutionPlan(groups: TestGroup[]): ExecutionPlan {
    // Sort groups by priority and complexity
    const sortedGroups = this.sortGroupsByPriority(groups);
    
    // Create worker assignments based on load balancing strategy
    const workerAssignments = this.createWorkerAssignments(sortedGroups);
    
    // Calculate resource allocation
    const resourceAllocation = this.calculateResourceAllocation(sortedGroups);
    
    // Estimate total duration
    const estimatedDuration = this.estimateTotalDuration(sortedGroups, workerAssignments);

    return {
      groups: sortedGroups,
      workerAssignments,
      resourceAllocation,
      estimatedDuration,
      isolationStrategy: this.isolationStrategy
    };
  }

  private sortGroupsByPriority(groups: TestGroup[]): TestGroup[] {
    return groups.sort((a, b) => {
      // Priority order: critical > high > normal > low
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same priority, sort by dependency level (higher first)
      const depDiff = b.dependencyLevel - a.dependencyLevel;
      if (depDiff !== 0) return depDiff;
      
      // Finally, sort by estimated duration (longer first for better load balancing)
      return b.estimatedDuration - a.estimatedDuration;
    });
  }

  private createWorkerAssignments(groups: TestGroup[]): Map<number, TestGroup[]> {
    const assignments = new Map<number, TestGroup[]>();
    const workerLoads = new Map<number, number>();
    
    // Initialize worker assignments
    for (let i = 0; i < this.maxWorkers; i++) {
      assignments.set(i, []);
      workerLoads.set(i, 0);
    }

    // Assign groups using least-loaded-first strategy
    for (const group of groups) {
      // Find the worker with the least load that can handle this group
      let bestWorker = 0;
      let minLoad = Infinity;
      
      for (let workerId = 0; workerId < this.maxWorkers; workerId++) {
        const currentLoad = workerLoads.get(workerId) || 0;
        const canHandle = this.canWorkerHandleGroup(workerId, group);
        
        if (canHandle && currentLoad < minLoad) {
          minLoad = currentLoad;
          bestWorker = workerId;
        }
      }
      
      // Assign group to best worker
      assignments.get(bestWorker)!.push(group);
      workerLoads.set(bestWorker, minLoad + group.estimatedDuration);
    }

    return assignments;
  }

  private canWorkerHandleGroup(workerId: number, group: TestGroup): boolean {
    const config = this.workerConfigs.get(workerId);
    if (!config) return false;

    // Check memory constraints
    if (group.resourceRequirements.memoryMB > config.maxMemoryMB) {
      return false;
    }

    // Check database connection constraints
    if (group.resourceRequirements.databaseConnections > config.databaseConnectionLimit) {
      return false;
    }

    // Check isolation level compatibility
    if (group.requiresIsolation && config.isolationLevel === IsolationLevel.NONE) {
      return false;
    }

    return true;
  }

  private calculateResourceAllocation(groups: TestGroup[]): ResourceAllocation {
    // This is a simplified resource allocation - in practice, this would be more sophisticated
    const totalMemory = groups.reduce((sum, g) => sum + g.resourceRequirements.memoryMB, 0);
    const totalConnections = groups.reduce((sum, g) => sum + g.resourceRequirements.databaseConnections, 0);
    
    return {
      workerId: 0, // This would be per-worker in a real implementation
      memoryMB: Math.min(totalMemory, this.resourceConstraints.maxTotalMemoryMB),
      cpuCores: Array.from({ length: cpus().length }, (_, i) => i),
      databaseConnections: Math.min(totalConnections, this.resourceConstraints.maxDatabaseConnections),
      priority: 'normal',
      exclusiveResources: []
    };
  }

  private estimateTotalDuration(groups: TestGroup[], assignments: Map<number, TestGroup[]>): number {
    let maxWorkerDuration = 0;
    
    for (const [workerId, workerGroups] of assignments) {
      const workerDuration = workerGroups.reduce((sum, group) => {
        // Account for parallelization within the group
        const parallelDuration = group.estimatedDuration / Math.min(group.maxParallelism, group.tests.length);
        return sum + parallelDuration;
      }, 0);
      
      maxWorkerDuration = Math.max(maxWorkerDuration, workerDuration);
    }
    
    return maxWorkerDuration;
  }

  private async executeWithPlan(plan: ExecutionPlan): Promise<void> {
    console.log(`⚡ Starting execution with ${plan.groups.length} groups across ${this.workers.size} workers...`);
    
    // Start assigning tests to workers
    for (let workerId = 0; workerId < this.maxWorkers; workerId++) {
      this.assignNextTest(workerId);
    }
  }

  private assignNextTest(workerId: number): void {
    const worker = this.workers.get(workerId);
    const metrics = this.workerMetrics.get(workerId);
    
    if (!worker || !metrics || metrics.status !== WorkerStatus.IDLE) {
      return;
    }

    // Find next suitable test group for this worker
    const nextGroup = this.findNextGroupForWorker(workerId);
    if (!nextGroup) {
      return; // No more tests for this worker
    }

    // Remove group from queue
    const queueIndex = this.executionQueue.indexOf(nextGroup);
    if (queueIndex >= 0) {
      this.executionQueue.splice(queueIndex, 1);
    }

    // Assign group to worker
    this.activeExecutions.set(workerId, nextGroup);
    metrics.status = WorkerStatus.RUNNING;
    metrics.currentTest = nextGroup.id;
    metrics.queueLength = this.executionQueue.length;

    // Send test group to worker
    worker.postMessage({
      type: 'executeGroup',
      group: nextGroup,
      isolationLevel: this.workerConfigs.get(workerId)?.isolationLevel
    });

    console.log(`📤 Assigned group ${nextGroup.id} to worker ${workerId}`);
  }

  private findNextGroupForWorker(workerId: number): TestGroup | null {
    for (const group of this.executionQueue) {
      if (this.canWorkerHandleGroup(workerId, group)) {
        return group;
      }
    }
    return null;
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        const allIdle = Array.from(this.workerMetrics.values()).every(
          metrics => metrics.status === WorkerStatus.IDLE || metrics.status === WorkerStatus.ERROR
        );
        
        const queueEmpty = this.executionQueue.length === 0;
        const noActiveExecutions = this.activeExecutions.size === 0;

        if (allIdle && queueEmpty && noActiveExecutions) {
          resolve();
        } else {
          setTimeout(checkCompletion, 1000);
        }
      };
      
      checkCompletion();
    });
  }

  private generateExecutionSummary(totalDuration: number): ExecutionSummary {
    const totalTests = this.completedExecutions.length + this.failedExecutions.length;
    const successRate = totalTests > 0 ? (this.completedExecutions.length / totalTests) * 100 : 0;
    
    const workerStats = Array.from(this.workerMetrics.values()).map(metrics => ({
      workerId: metrics.workerId,
      testsCompleted: metrics.testsCompleted,
      testsFailures: metrics.testsFailures,
      averageTestDuration: metrics.averageTestDuration,
      uptime: metrics.uptime
    }));

    return {
      totalDuration,
      totalTests,
      completedTests: this.completedExecutions.length,
      failedTests: this.failedExecutions.length,
      successRate,
      workerStats,
      resourceUsage: this.resourceMonitor.getCurrentUsage(),
      isolationStrategy: this.isolationStrategy,
      bottlenecks: this.resourceMonitor.getBottlenecks()
    };
  }

  private startResourceMonitoring(): void {
    this.resourceMonitor.start();
    this.resourceMonitor.on('highLoad', (metrics) => {
      console.warn('⚠️ High system load detected:', metrics);
      this.handleHighLoad(metrics);
    });
    
    this.resourceMonitor.on('lowMemory', (metrics) => {
      console.warn('⚠️ Low memory detected:', metrics);
      this.handleLowMemory(metrics);
    });
  }

  private handleHighLoad(metrics: any): void {
    // Reduce parallelism or pause execution if needed
    console.log('🔄 Adjusting execution due to high load...');
    this.emit('loadAdjustment', 'high_load', metrics);
  }

  private handleLowMemory(metrics: any): void {
    // Force garbage collection and reduce memory usage
    if (global.gc) {
      global.gc();
    }
    console.log('🔄 Adjusting execution due to low memory...');
    this.emit('loadAdjustment', 'low_memory', metrics);
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkWorkerHeartbeats();
    }, 10000); // Check every 10 seconds
  }

  private checkWorkerHeartbeats(): void {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    
    for (const [workerId, metrics] of this.workerMetrics) {
      const timeSinceLastHeartbeat = now - metrics.lastHeartbeat.getTime();
      
      if (timeSinceLastHeartbeat > staleThreshold && metrics.status !== WorkerStatus.TERMINATED) {
        console.warn(`⚠️ Worker ${workerId} heartbeat stale (${timeSinceLastHeartbeat}ms ago)`);
        
        // Try to restart stale worker
        if (timeSinceLastHeartbeat > staleThreshold * 2) {
          console.error(`💀 Worker ${workerId} appears dead, restarting...`);
          this.restartWorker(workerId);
        }
      }
    }
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): ExecutionStatus {
    const totalTests = this.completedExecutions.length + this.failedExecutions.length + this.executionQueue.length;
    const completedTests = this.completedExecutions.length + this.failedExecutions.length;
    const progress = totalTests > 0 ? (completedTests / totalTests) * 100 : 0;

    return {
      isRunning: this.executionQueue.length > 0 || this.activeExecutions.size > 0,
      progress,
      queueLength: this.executionQueue.length,
      activeTests: this.activeExecutions.size,
      completedTests: this.completedExecutions.length,
      failedTests: this.failedExecutions.length,
      workerMetrics: Array.from(this.workerMetrics.values())
    };
  }

  /**
   * Gracefully shutdown the framework
   */
  async shutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    
    this.shutdownInProgress = true;
    console.log('🔄 Shutting down Parallel Execution Framework...');

    // Clear monitoring timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Stop resource monitoring
    this.resourceMonitor.stop();

    // Gracefully terminate all workers
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [workerId, worker] of this.workers) {
      shutdownPromises.push(this.shutdownWorker(worker, workerId));
    }

    await Promise.allSettled(shutdownPromises);
    
    // Clear all data structures
    this.workers.clear();
    this.workerConfigs.clear();
    this.workerMetrics.clear();
    this.executionQueue = [];
    this.activeExecutions.clear();

    this.removeAllListeners();
    console.log('✅ Parallel Execution Framework shutdown complete');
  }

  private async shutdownWorker(worker: Worker, workerId: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`⚠️ Worker ${workerId} shutdown timeout, terminating...`);
        worker.terminate();
        resolve();
      }, 5000);

      worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      // Request graceful shutdown
      worker.postMessage({ type: 'shutdown' });
    });
  }
}

// Resource monitoring class
class ResourceMonitor extends EventEmitter {
  private constraints: ResourceConstraints;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private bottlenecks: string[] = [];

  constructor(constraints: ResourceConstraints) {
    super();
    this.constraints = constraints;
  }

  start(): void {
    if (this.monitoringInterval) return;
    
    this.monitoringInterval = setInterval(() => {
      this.checkResources();
    }, 5000);
    
    console.log('📊 Resource monitoring started');
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('📊 Resource monitoring stopped');
  }

  private async checkResources(): Promise<void> {
    const usage = this.getCurrentUsage();
    
    // Check CPU usage
    if (usage.cpuUsage > this.constraints.cpuThreshold) {
      this.emit('highLoad', { type: 'cpu', usage: usage.cpuUsage, threshold: this.constraints.cpuThreshold });
      this.addBottleneck(`High CPU usage: ${usage.cpuUsage.toFixed(1)}%`);
    }

    // Check memory usage
    if (usage.memoryUsage > this.constraints.memoryThreshold) {
      this.emit('lowMemory', { type: 'memory', usage: usage.memoryUsage, threshold: this.constraints.memoryThreshold });
      this.addBottleneck(`High memory usage: ${usage.memoryUsage.toFixed(1)}%`);
    }

    // Check disk space
    const diskSpace = await this.getDiskSpace();
    if (diskSpace < this.constraints.diskSpaceThreshold) {
      this.emit('lowDiskSpace', { type: 'disk', available: diskSpace, threshold: this.constraints.diskSpaceThreshold });
      this.addBottleneck(`Low disk space: ${diskSpace.toFixed(1)}GB`);
    }
  }

  getCurrentUsage(): ResourceUsage {
    const memUsage = process.memoryUsage();
    const totalMemory = totalmem();
    const freeMemory = freemem();
    
    return {
      cpuUsage: this.getCpuUsage(),
      memoryUsage: ((totalMemory - freeMemory) / totalMemory) * 100,
      diskUsage: 0, // Would need to check actual disk usage
      totalMemoryMB: Math.floor(totalMemory / 1024 / 1024),
      usedMemoryMB: Math.floor((totalMemory - freeMemory) / 1024 / 1024),
      heapUsedMB: Math.floor(memUsage.heapUsed / 1024 / 1024)
    };
  }

  private getCpuUsage(): number {
    // This is a simplified CPU usage calculation
    // In practice, you'd want to use a more sophisticated method
    const cpuInfo = cpus();
    return Math.random() * 20 + 40; // Mock value between 40-60%
  }

  private async getDiskSpace(): Promise<number> {
    try {
      const { stdout } = await execAsync('df -BG . | tail -1 | awk \'{print $4}\'');
      return parseInt(stdout.replace('G', '')) || 10; // Default to 10GB if parsing fails
    } catch {
      return 10; // Default value
    }
  }

  private addBottleneck(bottleneck: string): void {
    this.bottlenecks.push(`${new Date().toISOString()}: ${bottleneck}`);
    
    // Keep only last 50 bottlenecks
    if (this.bottlenecks.length > 50) {
      this.bottlenecks = this.bottlenecks.slice(-50);
    }
  }

  getBottlenecks(): string[] {
    return [...this.bottlenecks];
  }

  isHighLoad(): boolean {
    const usage = this.getCurrentUsage();
    return usage.cpuUsage > this.constraints.cpuThreshold || 
           usage.memoryUsage > this.constraints.memoryThreshold;
  }
}

// Worker thread implementation
if (!isMainThread && parentPort) {
  class TestWorker {
    private config: WorkerConfiguration;
    private metrics: WorkerMetrics;
    private poolManager: TestConnectionPoolManager | null = null;
    
    constructor(workerId: number, config: WorkerConfiguration) {
      this.config = config;
      this.metrics = {
        workerId,
        status: WorkerStatus.INITIALIZING,
        currentTest: null,
        testsCompleted: 0,
        testsFailures: 0,
        uptime: 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: 0,
        databaseConnections: 0,
        lastHeartbeat: new Date(),
        averageTestDuration: 0,
        queueLength: 0
      };
      
      this.startHeartbeat();
      this.updateStatus(WorkerStatus.IDLE);
      
      console.log(`👷 Worker ${workerId} initialized`);
    }

    private startHeartbeat(): void {
      setInterval(() => {
        this.sendHeartbeat();
      }, this.config.heartbeatInterval);
    }

    private sendHeartbeat(): void {
      parentPort!.postMessage({
        type: 'heartbeat',
        status: this.metrics.status,
        memoryUsage: process.memoryUsage(),
        cpuUsage: this.getCpuUsage()
      });
    }

    private getCpuUsage(): number {
      // Simplified CPU usage for worker
      return Math.random() * 10 + 30; // Mock value
    }

    private updateStatus(status: WorkerStatus): void {
      this.metrics.status = status;
      parentPort!.postMessage({
        type: 'statusUpdate',
        status,
        currentTest: this.metrics.currentTest
      });
    }

    async executeGroup(group: TestGroup, isolationLevel: IsolationLevel): Promise<void> {
      console.log(`🔄 Worker ${this.config.id} executing group ${group.id} with ${group.tests.length} tests`);
      
      this.updateStatus(WorkerStatus.RUNNING);
      this.metrics.currentTest = group.id;
      
      const startTime = performance.now();
      
      try {
        for (const testFile of group.tests) {
          await this.executeTest(testFile, group, isolationLevel);
        }
        
        const duration = performance.now() - startTime;
        
        parentPort!.postMessage({
          type: 'testCompleted',
          result: {
            testFile: group.id,
            groupId: group.id,
            workerId: this.config.id,
            success: true,
            duration,
            memoryPeak: process.memoryUsage().heapUsed,
            databaseOperations: 0,
            isolationUsed: isolationLevel !== IsolationLevel.NONE,
            errors: [],
            warnings: [],
            metadata: { isolationLevel }
          }
        });
        
        this.metrics.testsCompleted++;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        parentPort!.postMessage({
          type: 'testFailed',
          result: {
            testFile: group.id,
            groupId: group.id,
            workerId: this.config.id,
            success: false,
            duration,
            memoryPeak: process.memoryUsage().heapUsed,
            databaseOperations: 0,
            isolationUsed: isolationLevel !== IsolationLevel.NONE,
            errors: [error.message],
            warnings: [],
            metadata: { isolationLevel, error: error.stack }
          }
        });
        
        this.metrics.testsFailures++;
      } finally {
        this.updateStatus(WorkerStatus.IDLE);
        this.metrics.currentTest = null;
      }
    }

    private async executeTest(testFile: string, group: TestGroup, isolationLevel: IsolationLevel): Promise<void> {
      // This is a placeholder for actual test execution
      // In practice, this would integrate with Vitest or another test runner
      
      const duration = Math.random() * 2000 + 500; // Random duration between 500-2500ms
      await new Promise(resolve => setTimeout(resolve, duration));
      
      // Simulate occasional failures
      if (Math.random() < 0.05) { // 5% failure rate
        throw new Error(`Simulated test failure in ${testFile}`);
      }
      
      console.log(`✅ Worker ${this.config.id} completed test ${testFile}`);
    }
  }

  // Initialize worker
  const { workerId, config } = workerData;
  const worker = new TestWorker(workerId, config);

  // Handle messages from main thread
  parentPort.on('message', async (message) => {
    switch (message.type) {
      case 'executeGroup':
        await worker.executeGroup(message.group, message.isolationLevel);
        break;
      
      case 'shutdown':
        console.log(`🔄 Worker ${workerId} shutting down...`);
        process.exit(0);
        break;
        
      default:
        console.warn(`Worker ${workerId} received unknown message:`, message.type);
    }
  });
}

// Type definitions
export interface ExecutionSummary {
  totalDuration: number;
  totalTests: number;
  completedTests: number;
  failedTests: number;
  successRate: number;
  workerStats: WorkerStats[];
  resourceUsage: ResourceUsage;
  isolationStrategy: IsolationStrategy;
  bottlenecks: string[];
}

export interface WorkerStats {
  workerId: number;
  testsCompleted: number;
  testsFailures: number;
  averageTestDuration: number;
  uptime: number;
}

export interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  totalMemoryMB: number;
  usedMemoryMB: number;
  heapUsedMB: number;
}

export interface ExecutionStatus {
  isRunning: boolean;
  progress: number;
  queueLength: number;
  activeTests: number;
  completedTests: number;
  failedTests: number;
  workerMetrics: WorkerMetrics[];
}

// Enhanced Enterprise-Grade Error Recovery System
export class ErrorRecoverySystem extends EventEmitter {
  private retryPolicies: Map<string, RetryPolicy> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.initializeDefaultPolicies();
  }
  
  private initializeDefaultPolicies(): void {
    // Database connection errors
    this.retryPolicies.set('database_connection', {
      maxRetries: 3,
      backoffStrategy: 'exponential',
      baseDelay: 1000,
      maxDelay: 10000,
      jitter: true,
      retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']
    });
    
    // Memory pressure errors
    this.retryPolicies.set('memory_pressure', {
      maxRetries: 2,
      backoffStrategy: 'linear',
      baseDelay: 5000,
      maxDelay: 15000,
      jitter: false,
      retryableErrors: ['ENOMEM', 'JavaScript heap out of memory']
    });
    
    // Worker timeout errors
    this.retryPolicies.set('worker_timeout', {
      maxRetries: 1,
      backoffStrategy: 'immediate',
      baseDelay: 0,
      maxDelay: 0,
      jitter: false,
      retryableErrors: ['timeout', 'worker_unresponsive']
    });
  }
  
  async handleError(error: Error, context: ErrorContext): Promise<RecoveryResult> {
    const errorType = this.classifyError(error);
    const policy = this.retryPolicies.get(errorType);
    
    if (!policy) {
      return { action: 'fail', reason: 'No recovery policy found' };
    }
    
    const circuitState = this.circuitBreakers.get(context.resourceId) || { 
      state: 'closed', 
      failures: 0, 
      lastFailure: null, 
      halfOpenAttempts: 0 
    };
    
    // Check circuit breaker state
    if (circuitState.state === 'open') {
      const timeSinceLastFailure = Date.now() - (circuitState.lastFailure?.getTime() || 0);
      if (timeSinceLastFailure < 60000) { // 1 minute cooling period
        return { action: 'skip', reason: 'Circuit breaker open' };
      } else {
        circuitState.state = 'half-open';
        circuitState.halfOpenAttempts = 0;
      }
    }
    
    if (context.retryCount >= policy.maxRetries) {
      circuitState.state = 'open';
      circuitState.failures++;
      circuitState.lastFailure = new Date();
      this.circuitBreakers.set(context.resourceId, circuitState);
      
      return { action: 'fail', reason: 'Max retries exceeded' };
    }
    
    const delay = this.calculateBackoffDelay(policy, context.retryCount);
    
    this.emit('errorRecovery', {
      error,
      context,
      policy,
      delay,
      circuitState
    });
    
    return { 
      action: 'retry', 
      delay, 
      strategy: this.getRecoveryStrategy(errorType) 
    };
  }
  
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('connection') || message.includes('timeout')) {
      return 'database_connection';
    }
    
    if (message.includes('memory') || message.includes('heap')) {
      return 'memory_pressure';
    }
    
    if (message.includes('timeout') || message.includes('unresponsive')) {
      return 'worker_timeout';
    }
    
    return 'general';
  }
  
  private calculateBackoffDelay(policy: RetryPolicy, retryCount: number): number {
    let delay: number;
    
    switch (policy.backoffStrategy) {
      case 'exponential':
        delay = Math.min(policy.baseDelay * Math.pow(2, retryCount), policy.maxDelay);
        break;
      case 'linear':
        delay = Math.min(policy.baseDelay * (retryCount + 1), policy.maxDelay);
        break;
      case 'immediate':
        delay = 0;
        break;
      default:
        delay = policy.baseDelay;
    }
    
    if (policy.jitter) {
      delay += Math.random() * 1000;
    }
    
    return delay;
  }
  
  private getRecoveryStrategy(errorType: string): RecoveryStrategy {
    return this.recoveryStrategies.get(errorType) || {
      type: 'restart',
      actions: ['cleanup_resources', 'reinitialize'],
      timeout: 30000
    };
  }
}

// Enhanced Performance Profiler
export class PerformanceProfiler extends EventEmitter {
  private profiles: Map<string, PerformanceProfile> = new Map();
  private samplingInterval: NodeJS.Timeout | null = null;
  private enabledMetrics: Set<string> = new Set(['cpu', 'memory', 'io', 'network']);
  private profileHistory: PerformanceSnapshot[] = [];
  private alertThresholds: Map<string, number> = new Map();
  
  constructor() {
    super();
    this.initializeThresholds();
  }
  
  private initializeThresholds(): void {
    this.alertThresholds.set('cpu_usage', 90);
    this.alertThresholds.set('memory_usage', 85);
    this.alertThresholds.set('heap_usage', 80);
    this.alertThresholds.set('event_loop_lag', 100); // ms
    this.alertThresholds.set('gc_pressure', 75);
  }
  
  startProfiling(interval: number = 5000): void {
    if (this.samplingInterval) {
      this.stopProfiling();
    }
    
    this.samplingInterval = setInterval(() => {
      this.captureSnapshot();
    }, interval);
    
    console.log('📊 Performance profiling started');
    this.emit('profilingStarted');
  }
  
  stopProfiling(): void {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }
    
    console.log('📊 Performance profiling stopped');
    this.emit('profilingStopped');
  }
  
  private captureSnapshot(): void {
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpu: this.getCpuUsage(),
      eventLoopLag: this.measureEventLoopLag(),
      gcStats: this.getGCStats(),
      handles: process._getActiveHandles().length,
      requests: process._getActiveRequests().length
    };
    
    this.profileHistory.push(snapshot);
    
    // Keep only last 1000 snapshots
    if (this.profileHistory.length > 1000) {
      this.profileHistory = this.profileHistory.slice(-1000);
    }
    
    this.analyzeSnapshot(snapshot);
    this.emit('snapshot', snapshot);
  }
  
  private getCpuUsage(): NodeJS.CpuUsage {
    return process.cpuUsage();
  }
  
  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      this.emit('eventLoopLag', lag);
    });
    return 0; // Actual measurement is async
  }
  
  private getGCStats(): any {
    // Mock GC stats - in real implementation, use perf_hooks
    return {
      majorCollections: 0,
      minorCollections: 0,
      totalTime: 0
    };
  }
  
  private analyzeSnapshot(snapshot: PerformanceSnapshot): void {
    const memoryUsagePercent = (snapshot.memory.heapUsed / snapshot.memory.heapTotal) * 100;
    
    if (memoryUsagePercent > this.alertThresholds.get('heap_usage')!) {
      this.emit('alert', {
        type: 'high_memory_usage',
        value: memoryUsagePercent,
        threshold: this.alertThresholds.get('heap_usage'),
        snapshot
      });
    }
    
    if (snapshot.handles > 1000) {
      this.emit('alert', {
        type: 'high_handle_count',
        value: snapshot.handles,
        threshold: 1000,
        snapshot
      });
    }
  }
  
  getPerformanceReport(): PerformanceReport {
    if (this.profileHistory.length === 0) {
      return {
        summary: 'No performance data available',
        metrics: {},
        recommendations: ['Start performance profiling to gather metrics']
      };
    }
    
    const recent = this.profileHistory.slice(-10);
    const avgMemory = recent.reduce((sum, s) => sum + s.memory.heapUsed, 0) / recent.length;
    const maxMemory = Math.max(...recent.map(s => s.memory.heapUsed));
    const avgHandles = recent.reduce((sum, s) => sum + s.handles, 0) / recent.length;
    
    return {
      summary: `Performance analysis based on ${this.profileHistory.length} samples`,
      metrics: {
        averageMemoryUsage: Math.round(avgMemory / 1024 / 1024) + 'MB',
        peakMemoryUsage: Math.round(maxMemory / 1024 / 1024) + 'MB',
        averageHandleCount: Math.round(avgHandles),
        totalSnapshots: this.profileHistory.length
      },
      recommendations: this.generateRecommendations(recent)
    };
  }
  
  private generateRecommendations(snapshots: PerformanceSnapshot[]): string[] {
    const recommendations: string[] = [];
    const avgMemory = snapshots.reduce((sum, s) => sum + s.memory.heapUsed, 0) / snapshots.length;
    const memoryTrend = this.calculateTrend(snapshots.map(s => s.memory.heapUsed));
    
    if (memoryTrend > 0.1) {
      recommendations.push('Memory usage is trending upward - check for memory leaks');
    }
    
    if (avgMemory > 500 * 1024 * 1024) { // 500MB
      recommendations.push('High average memory usage - consider optimization');
    }
    
    const avgHandles = snapshots.reduce((sum, s) => sum + s.handles, 0) / snapshots.length;
    if (avgHandles > 500) {
      recommendations.push('High handle count - check for resource leaks');
    }
    
    return recommendations;
  }
  
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const first = values[0];
    const last = values[values.length - 1];
    return (last - first) / first;
  }
}

// Circuit Breaker Implementation
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private lastFailureTime: Date | null = null;
  private successCount: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringWindow: number;
  
  constructor(options: {
    failureThreshold?: number;
    resetTimeout?: number;
    monitoringWindow?: number;
  } = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringWindow = options.monitoringWindow || 300000; // 5 minutes
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = 'closed';
      }
    }
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }
  
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.resetTimeout;
  }
  
  getState(): { state: string; failureCount: number; lastFailureTime: Date | null } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Adaptive Throttling System
export class AdaptiveThrottling extends EventEmitter {
  private currentLimit: number;
  private readonly minLimit: number;
  private readonly maxLimit: number;
  private readonly stepSize: number;
  private metrics: ThrottlingMetrics;
  private adjustmentTimer: NodeJS.Timeout | null = null;
  
  constructor(options: {
    initialLimit?: number;
    minLimit?: number;
    maxLimit?: number;
    stepSize?: number;
  } = {}) {
    super();
    this.currentLimit = options.initialLimit || 10;
    this.minLimit = options.minLimit || 2;
    this.maxLimit = options.maxLimit || 50;
    this.stepSize = options.stepSize || 2;
    
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      successRate: 100,
      averageResponseTime: 0,
      lastAdjustment: new Date()
    };
    
    this.startAdaptiveAdjustment();
  }
  
  private startAdaptiveAdjustment(): void {
    this.adjustmentTimer = setInterval(() => {
      this.adjustThrottleLimit();
    }, 30000); // Adjust every 30 seconds
  }
  
  private adjustThrottleLimit(): void {
    const successRate = this.calculateSuccessRate();
    const responseTime = this.metrics.averageResponseTime;
    
    if (successRate > 95 && responseTime < 1000) {
      // System is healthy, can increase limit
      this.increaseLimit();
    } else if (successRate < 80 || responseTime > 5000) {
      // System is struggling, decrease limit
      this.decreaseLimit();
    }
    
    this.emit('throttleAdjusted', {
      newLimit: this.currentLimit,
      successRate,
      responseTime,
      reason: this.getAdjustmentReason(successRate, responseTime)
    });
  }
  
  private calculateSuccessRate(): number {
    if (this.metrics.requestCount === 0) return 100;
    return ((this.metrics.requestCount - this.metrics.errorCount) / this.metrics.requestCount) * 100;
  }
  
  private increaseLimit(): void {
    const newLimit = Math.min(this.currentLimit + this.stepSize, this.maxLimit);
    if (newLimit !== this.currentLimit) {
      this.currentLimit = newLimit;
      console.log(`📈 Increased throttle limit to ${this.currentLimit}`);
    }
  }
  
  private decreaseLimit(): void {
    const newLimit = Math.max(this.currentLimit - this.stepSize, this.minLimit);
    if (newLimit !== this.currentLimit) {
      this.currentLimit = newLimit;
      console.log(`📉 Decreased throttle limit to ${this.currentLimit}`);
    }
  }
  
  private getAdjustmentReason(successRate: number, responseTime: number): string {
    if (successRate > 95 && responseTime < 1000) {
      return 'System healthy - increasing throughput';
    } else if (successRate < 80) {
      return 'High error rate - reducing load';
    } else if (responseTime > 5000) {
      return 'High response time - reducing load';
    }
    return 'No adjustment needed';
  }
  
  async throttle<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordError(Date.now() - startTime);
      throw error;
    }
  }
  
  private recordSuccess(responseTime: number): void {
    this.metrics.requestCount++;
    this.updateAverageResponseTime(responseTime);
  }
  
  private recordError(responseTime: number): void {
    this.metrics.requestCount++;
    this.metrics.errorCount++;
    this.updateAverageResponseTime(responseTime);
  }
  
  private updateAverageResponseTime(responseTime: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.metrics.averageResponseTime = 
      (alpha * responseTime) + ((1 - alpha) * this.metrics.averageResponseTime);
  }
  
  getCurrentLimit(): number {
    return this.currentLimit;
  }
  
  getMetrics(): ThrottlingMetrics {
    return { ...this.metrics };
  }
  
  stop(): void {
    if (this.adjustmentTimer) {
      clearInterval(this.adjustmentTimer);
      this.adjustmentTimer = null;
    }
  }
}

// Enhanced Alert Manager
export class AlertManager extends EventEmitter {
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, ActiveAlert> = new Map();
  private alertHistory: AlertHistoryEntry[] = [];
  private suppressionRules: Map<string, SuppressionRule> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  
  constructor() {
    super();
    this.initializeDefaultRules();
  }
  
  private initializeDefaultRules(): void {
    this.alertRules.set('high_error_rate', {
      name: 'High Error Rate',
      condition: (metrics: any) => metrics.errorRate > 10,
      severity: 'warning',
      cooldown: 300000, // 5 minutes
      message: 'Error rate exceeded 10%'
    });
    
    this.alertRules.set('critical_error_rate', {
      name: 'Critical Error Rate',
      condition: (metrics: any) => metrics.errorRate > 25,
      severity: 'critical',
      cooldown: 60000, // 1 minute
      message: 'Error rate exceeded 25% - immediate attention required'
    });
    
    this.alertRules.set('memory_pressure', {
      name: 'Memory Pressure',
      condition: (metrics: any) => metrics.memoryUsage > 85,
      severity: 'warning',
      cooldown: 180000, // 3 minutes
      message: 'Memory usage exceeded 85%'
    });
    
    this.alertRules.set('worker_failure', {
      name: 'Worker Failure',
      condition: (metrics: any) => metrics.failedWorkers > 2,
      severity: 'critical',
      cooldown: 120000, // 2 minutes
      message: 'Multiple worker failures detected'
    });
  }
  
  evaluateMetrics(metrics: any): void {
    for (const [ruleId, rule] of this.alertRules) {
      if (rule.condition(metrics)) {
        this.triggerAlert(ruleId, rule, metrics);
      } else {
        this.resolveAlert(ruleId);
      }
    }
  }
  
  private triggerAlert(ruleId: string, rule: AlertRule, metrics: any): void {
    const existingAlert = this.activeAlerts.get(ruleId);
    const now = Date.now();
    
    // Check cooldown period
    if (existingAlert && (now - existingAlert.lastTriggered) < rule.cooldown) {
      return;
    }
    
    // Check suppression rules
    if (this.isAlertSuppressed(ruleId, metrics)) {
      return;
    }
    
    const alert: ActiveAlert = {
      id: ruleId,
      rule,
      triggeredAt: new Date(),
      lastTriggered: now,
      triggerCount: existingAlert ? existingAlert.triggerCount + 1 : 1,
      metrics: { ...metrics },
      resolved: false
    };
    
    this.activeAlerts.set(ruleId, alert);
    this.addToHistory(alert);
    
    console.warn(`🚨 ALERT: ${rule.name} - ${rule.message}`);
    this.emit('alert', alert);
    this.sendNotifications(alert);
  }
  
  private resolveAlert(ruleId: string): void {
    const alert = this.activeAlerts.get(ruleId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      
      console.log(`✅ RESOLVED: ${alert.rule.name}`);
      this.emit('alertResolved', alert);
      this.activeAlerts.delete(ruleId);
    }
  }
  
  private isAlertSuppressed(ruleId: string, metrics: any): boolean {
    const suppression = this.suppressionRules.get(ruleId);
    if (!suppression) return false;
    
    const now = Date.now();
    if (now < suppression.until) {
      return true;
    }
    
    return false;
  }
  
  private addToHistory(alert: ActiveAlert): void {
    this.alertHistory.push({
      id: alert.id,
      ruleName: alert.rule.name,
      severity: alert.rule.severity,
      triggeredAt: alert.triggeredAt,
      resolvedAt: alert.resolvedAt,
      metrics: alert.metrics
    });
    
    // Keep only last 1000 alerts
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }
  }
  
  private sendNotifications(alert: ActiveAlert): void {
    for (const [channelId, channel] of this.notificationChannels) {
      if (channel.severity.includes(alert.rule.severity)) {
        this.sendNotification(channel, alert);
      }
    }
  }
  
  private sendNotification(channel: NotificationChannel, alert: ActiveAlert): void {
    // Mock notification - in real implementation, integrate with actual notification systems
    console.log(`📢 Notification via ${channel.type}: ${alert.rule.message}`);
  }
  
  addNotificationChannel(id: string, channel: NotificationChannel): void {
    this.notificationChannels.set(id, channel);
  }
  
  suppressAlert(ruleId: string, duration: number): void {
    this.suppressionRules.set(ruleId, {
      ruleId,
      until: Date.now() + duration,
      reason: 'Manual suppression'
    });
  }
  
  getActiveAlerts(): ActiveAlert[] {
    return Array.from(this.activeAlerts.values());
  }
  
  getAlertHistory(): AlertHistoryEntry[] {
    return [...this.alertHistory];
  }
}

// Graceful Degradation System
export class GracefulDegradation extends EventEmitter {
  private degradationLevels: Map<string, DegradationLevel> = new Map();
  private currentLevel: number = 0;
  private maxLevel: number = 5;
  private autoRecoveryEnabled: boolean = true;
  private recoveryTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.initializeDegradationLevels();
  }
  
  private initializeDegradationLevels(): void {
    this.degradationLevels.set('0', {
      level: 0,
      name: 'Normal Operation',
      description: 'All systems operating normally',
      actions: [],
      thresholds: { errorRate: 0, memoryUsage: 0, responseTime: 0 }
    });
    
    this.degradationLevels.set('1', {
      level: 1,
      name: 'Reduced Parallelism',
      description: 'Reduce worker count by 25%',
      actions: ['reduce_workers'],
      thresholds: { errorRate: 5, memoryUsage: 80, responseTime: 2000 }
    });
    
    this.degradationLevels.set('2', {
      level: 2,
      name: 'Limited Concurrency',
      description: 'Reduce worker count by 50%, disable non-critical tests',
      actions: ['reduce_workers', 'disable_non_critical'],
      thresholds: { errorRate: 10, memoryUsage: 85, responseTime: 5000 }
    });
    
    this.degradationLevels.set('3', {
      level: 3,
      name: 'Emergency Mode',
      description: 'Sequential execution only, critical tests only',
      actions: ['sequential_only', 'critical_only'],
      thresholds: { errorRate: 20, memoryUsage: 90, responseTime: 10000 }
    });
    
    this.degradationLevels.set('4', {
      level: 4,
      name: 'Minimal Operation',
      description: 'Single worker, essential tests only',
      actions: ['single_worker', 'essential_only'],
      thresholds: { errorRate: 30, memoryUsage: 95, responseTime: 20000 }
    });
    
    this.degradationLevels.set('5', {
      level: 5,
      name: 'System Halt',
      description: 'Stop all test execution',
      actions: ['halt_execution'],
      thresholds: { errorRate: 50, memoryUsage: 98, responseTime: 30000 }
    });
  }
  
  evaluateSystemHealth(metrics: SystemHealthMetrics): void {
    const requiredLevel = this.calculateRequiredDegradationLevel(metrics);
    
    if (requiredLevel > this.currentLevel) {
      this.escalateDegradation(requiredLevel, metrics);
    } else if (requiredLevel < this.currentLevel && this.autoRecoveryEnabled) {
      this.scheduleRecovery(requiredLevel);
    }
  }
  
  private calculateRequiredDegradationLevel(metrics: SystemHealthMetrics): number {
    let maxLevel = 0;
    
    for (const [levelStr, level] of this.degradationLevels) {
      const levelNum = parseInt(levelStr);
      if (levelNum === 0) continue;
      
      if (metrics.errorRate >= level.thresholds.errorRate ||
          metrics.memoryUsage >= level.thresholds.memoryUsage ||
          metrics.responseTime >= level.thresholds.responseTime) {
        maxLevel = Math.max(maxLevel, levelNum);
      }
    }
    
    return maxLevel;
  }
  
  private escalateDegradation(targetLevel: number, metrics: SystemHealthMetrics): void {
    if (targetLevel > this.maxLevel) {
      targetLevel = this.maxLevel;
    }
    
    const previousLevel = this.currentLevel;
    this.currentLevel = targetLevel;
    
    const degradationLevel = this.degradationLevels.get(targetLevel.toString())!;
    
    console.warn(`⚠️ DEGRADATION: Escalating to level ${targetLevel} - ${degradationLevel.name}`);
    console.warn(`📊 Metrics: Error Rate: ${metrics.errorRate}%, Memory: ${metrics.memoryUsage}%, Response Time: ${metrics.responseTime}ms`);
    
    this.applyDegradationActions(degradationLevel.actions);
    
    this.emit('degradationEscalated', {
      previousLevel,
      currentLevel: this.currentLevel,
      degradationLevel,
      metrics
    });
  }
  
  private scheduleRecovery(targetLevel: number): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }
    
    // Wait before attempting recovery to ensure stability
    this.recoveryTimer = setTimeout(() => {
      this.recoverDegradation(targetLevel);
    }, 60000); // 1 minute delay
  }
  
  private recoverDegradation(targetLevel: number): void {
    const previousLevel = this.currentLevel;
    this.currentLevel = targetLevel;
    
    const degradationLevel = this.degradationLevels.get(targetLevel.toString())!;
    
    console.log(`✅ RECOVERY: Recovering to level ${targetLevel} - ${degradationLevel.name}`);
    
    this.applyDegradationActions(degradationLevel.actions);
    
    this.emit('degradationRecovered', {
      previousLevel,
      currentLevel: this.currentLevel,
      degradationLevel
    });
  }
  
  private applyDegradationActions(actions: string[]): void {
    for (const action of actions) {
      switch (action) {
        case 'reduce_workers':
          this.emit('actionRequired', { type: 'reduce_workers', factor: 0.5 });
          break;
        case 'disable_non_critical':
          this.emit('actionRequired', { type: 'filter_tests', criteria: 'critical_only' });
          break;
        case 'sequential_only':
          this.emit('actionRequired', { type: 'force_sequential' });
          break;
        case 'single_worker':
          this.emit('actionRequired', { type: 'set_workers', count: 1 });
          break;
        case 'halt_execution':
          this.emit('actionRequired', { type: 'emergency_stop' });
          break;
      }
    }
  }
  
  getCurrentLevel(): DegradationLevel {
    return this.degradationLevels.get(this.currentLevel.toString())!;
  }
  
  forceDegradation(level: number, reason: string): void {
    if (level < 0 || level > this.maxLevel) {
      throw new Error(`Invalid degradation level: ${level}`);
    }
    
    const previousLevel = this.currentLevel;
    this.currentLevel = level;
    
    const degradationLevel = this.degradationLevels.get(level.toString())!;
    
    console.warn(`🔧 FORCED DEGRADATION: ${reason} - Level ${level} - ${degradationLevel.name}`);
    
    this.applyDegradationActions(degradationLevel.actions);
    
    this.emit('forcedDegradation', {
      previousLevel,
      currentLevel: this.currentLevel,
      degradationLevel,
      reason
    });
  }
  
  enableAutoRecovery(): void {
    this.autoRecoveryEnabled = true;
  }
  
  disableAutoRecovery(): void {
    this.autoRecoveryEnabled = false;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }
}

// Type definitions for the enhanced systems
interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'exponential' | 'linear' | 'immediate';
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
  retryableErrors: string[];
}

interface ErrorContext {
  resourceId: string;
  operation: string;
  retryCount: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface RecoveryResult {
  action: 'retry' | 'fail' | 'skip';
  delay?: number;
  strategy?: RecoveryStrategy;
  reason: string;
}

interface RecoveryStrategy {
  type: 'restart' | 'reset' | 'fallback';
  actions: string[];
  timeout: number;
}

interface CircuitBreakerState {
  state: 'open' | 'closed' | 'half-open';
  failures: number;
  lastFailure: Date | null;
  halfOpenAttempts: number;
}

interface ErrorPattern {
  pattern: RegExp;
  classification: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoRecoverable: boolean;
}

interface PerformanceProfile {
  name: string;
  startTime: Date;
  endTime?: Date;
  samples: PerformanceSnapshot[];
  summary?: PerformanceSummary;
}

interface PerformanceSnapshot {
  timestamp: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  eventLoopLag: number;
  gcStats: any;
  handles: number;
  requests: number;
}

interface PerformanceSummary {
  duration: number;
  avgMemoryUsage: number;
  peakMemoryUsage: number;
  avgCpuUsage: number;
  peakCpuUsage: number;
  gcPressure: number;
}

interface PerformanceReport {
  summary: string;
  metrics: Record<string, any>;
  recommendations: string[];
}

interface ThrottlingMetrics {
  requestCount: number;
  errorCount: number;
  successRate: number;
  averageResponseTime: number;
  lastAdjustment: Date;
}

interface AlertRule {
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'info' | 'warning' | 'critical';
  cooldown: number;
  message: string;
}

interface ActiveAlert {
  id: string;
  rule: AlertRule;
  triggeredAt: Date;
  lastTriggered: number;
  triggerCount: number;
  metrics: any;
  resolved: boolean;
  resolvedAt?: Date;
}

interface AlertHistoryEntry {
  id: string;
  ruleName: string;
  severity: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  metrics: any;
}

interface SuppressionRule {
  ruleId: string;
  until: number;
  reason: string;
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'console';
  severity: string[];
  config: Record<string, any>;
}

interface DegradationLevel {
  level: number;
  name: string;
  description: string;
  actions: string[];
  thresholds: {
    errorRate: number;
    memoryUsage: number;
    responseTime: number;
  };
}

interface SystemHealthMetrics {
  errorRate: number;
  memoryUsage: number;
  responseTime: number;
  workerCount: number;
  queueLength: number;
  throughput: number;
}

interface ExecutionHistoryEntry {
  timestamp: Date;
  testGroup: string;
  duration: number;
  success: boolean;
  workerCount: number;
  memoryUsage: number;
  errors: string[];
}

interface ResourceUtilizationSnapshot {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: number;
  activeConnections: number;
}

// Deadlock Detection System
export class DeadlockDetector extends EventEmitter {
  private lockGraph: Map<string, Set<string>> = new Map();
  private resourceOwners: Map<string, string> = new Map();
  private waitingFor: Map<string, string> = new Map();
  private detectionInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.startDetection();
  }
  
  private startDetection(): void {
    this.detectionInterval = setInterval(() => {
      this.detectDeadlocks();
    }, 10000); // Check every 10 seconds
  }
  
  private detectDeadlocks(): void {
    const cycles = this.findCycles();
    if (cycles.length > 0) {
      this.emit('deadlockDetected', { cycles, timestamp: new Date() });
      console.error(`🔒 DEADLOCK DETECTED: ${cycles.length} cycles found`);
    }
  }
  
  private findCycles(): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];
    
    for (const node of this.lockGraph.keys()) {
      if (!visited.has(node)) {
        this.dfsForCycles(node, visited, recursionStack, [], cycles);
      }
    }
    
    return cycles;
  }
  
  private dfsForCycles(
    node: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
    cycles: string[][]
  ): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = this.lockGraph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        this.dfsForCycles(neighbor, visited, recursionStack, path, cycles);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push([...cycle, neighbor]);
      }
    }
    
    recursionStack.delete(node);
    path.pop();
  }
  
  addResourceLock(resource: string, owner: string): void {
    this.resourceOwners.set(resource, owner);
    
    // Update lock graph
    if (!this.lockGraph.has(owner)) {
      this.lockGraph.set(owner, new Set());
    }
  }
  
  addWaitRelation(waiter: string, resource: string): void {
    const owner = this.resourceOwners.get(resource);
    if (owner && owner !== waiter) {
      this.waitingFor.set(waiter, resource);
      
      // Add edge to lock graph
      if (!this.lockGraph.has(waiter)) {
        this.lockGraph.set(waiter, new Set());
      }
      this.lockGraph.get(waiter)!.add(owner);
    }
  }
  
  removeResourceLock(resource: string): void {
    const owner = this.resourceOwners.get(resource);
    if (owner) {
      this.resourceOwners.delete(resource);
      
      // Clean up waiting relations
      for (const [waiter, waitingResource] of this.waitingFor) {
        if (waitingResource === resource) {
          this.waitingFor.delete(waiter);
          this.lockGraph.get(waiter)?.delete(owner);
        }
      }
    }
  }
  
  stop(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }
}

// Memory Leak Detection System
export class MemoryLeakDetector extends EventEmitter {
  private baselineMemory: number = 0;
  private memorySnapshots: MemorySnapshot[] = [];
  private leakThreshold: number = 50 * 1024 * 1024; // 50MB
  private detectionInterval: NodeJS.Timeout | null = null;
  private heapDumpCount: number = 0;
  
  constructor() {
    super();
    this.baselineMemory = process.memoryUsage().heapUsed;
    this.startDetection();
  }
  
  private startDetection(): void {
    this.detectionInterval = setInterval(() => {
      this.checkForLeaks();
    }, 30000); // Check every 30 seconds
  }
  
  private checkForLeaks(): void {
    const currentMemory = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: currentMemory.heapUsed,
      heapTotal: currentMemory.heapTotal,
      external: currentMemory.external,
      rss: currentMemory.rss
    };
    
    this.memorySnapshots.push(snapshot);
    
    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots = this.memorySnapshots.slice(-100);
    }
    
    // Analyze for potential leaks
    if (this.memorySnapshots.length >= 10) {
      const leak = this.analyzeForLeaks();
      if (leak) {
        this.emit('memoryLeakDetected', leak);
        console.warn(`🧠 MEMORY LEAK DETECTED: ${leak.description}`);
        
        if (leak.severity === 'critical') {
          this.requestHeapDump();
        }
      }
    }
  }
  
  private analyzeForLeaks(): MemoryLeak | null {
    const recent10 = this.memorySnapshots.slice(-10);
    const growth = recent10[recent10.length - 1].heapUsed - recent10[0].heapUsed;
    const growthRate = growth / recent10.length; // Growth per snapshot
    
    // Check for consistent growth
    let consecutiveGrowth = 0;
    for (let i = 1; i < recent10.length; i++) {
      if (recent10[i].heapUsed > recent10[i - 1].heapUsed) {
        consecutiveGrowth++;
      } else {
        consecutiveGrowth = 0;
      }
    }
    
    if (consecutiveGrowth >= 7 && growthRate > 1024 * 1024) { // 1MB growth per snapshot
      const severity = growthRate > 10 * 1024 * 1024 ? 'critical' : 'warning';
      
      return {
        type: 'consistent_growth',
        severity,
        growthRate: growthRate / 1024 / 1024, // MB
        duration: (recent10[recent10.length - 1].timestamp - recent10[0].timestamp) / 1000, // seconds
        description: `Consistent memory growth detected: ${(growthRate / 1024 / 1024).toFixed(2)}MB per sample`,
        recommendations: [
          'Review recent code changes for unclosed resources',
          'Check for event listener leaks',
          'Verify proper cleanup in test teardown'
        ]
      };
    }
    
    return null;
  }
  
  private requestHeapDump(): void {
    if (this.heapDumpCount >= 3) {
      console.warn('Maximum heap dumps reached, skipping');
      return;
    }
    
    this.heapDumpCount++;
    console.log(`📸 Requesting heap dump #${this.heapDumpCount}`);
    
    // Mock heap dump request - in real implementation, use v8.writeHeapSnapshot()
    this.emit('heapDumpRequested', {
      dumpNumber: this.heapDumpCount,
      timestamp: new Date(),
      reason: 'Critical memory leak detected'
    });
  }
  
  getMemoryReport(): MemoryReport {
    if (this.memorySnapshots.length === 0) {
      return {
        status: 'No data available',
        currentUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        baselineUsage: this.baselineMemory / 1024 / 1024,
        growthSinceBaseline: 0,
        recommendations: []
      };
    }
    
    const current = this.memorySnapshots[this.memorySnapshots.length - 1];
    const growthSinceBaseline = (current.heapUsed - this.baselineMemory) / 1024 / 1024;
    
    return {
      status: growthSinceBaseline > 100 ? 'Warning: High memory growth' : 'Normal',
      currentUsage: current.heapUsed / 1024 / 1024,
      baselineUsage: this.baselineMemory / 1024 / 1024,
      growthSinceBaseline,
      recommendations: growthSinceBaseline > 50 ? [
        'Consider running garbage collection',
        'Review test cleanup procedures',
        'Check for resource leaks'
      ] : []
    };
  }
  
  forceGarbageCollection(): void {
    if (global.gc) {
      console.log('🗑️ Forcing garbage collection');
      global.gc();
      this.emit('garbageCollectionForced');
    } else {
      console.warn('Garbage collection not available (run with --expose-gc)');
    }
  }
  
  stop(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }
}

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

interface MemoryLeak {
  type: string;
  severity: 'warning' | 'critical';
  growthRate: number;
  duration: number;
  description: string;
  recommendations: string[];
}

interface MemoryReport {
  status: string;
  currentUsage: number;
  baselineUsage: number;
  growthSinceBaseline: number;
  recommendations: string[];
}

export default ParallelExecutionFramework;