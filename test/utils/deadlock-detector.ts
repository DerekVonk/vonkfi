import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export interface DeadlockInfo {
  transactionId: string;
  testFile: string;
  testName: string;
  startTime: Date;
  isolationLevel: string;
  detectedAt?: Date;
  involvedTransactions?: string[];
  errorMessage?: string;
}

export interface DeadlockPattern {
  id: string;
  transactions: string[];
  detectedAt: Date;
  frequency: number;
  lastOccurrence: Date;
}

export class DeadlockDetector extends EventEmitter {
  private activeTransactions = new Map<string, DeadlockInfo>();
  private deadlockHistory: DeadlockInfo[] = [];
  private deadlockPatterns = new Map<string, DeadlockPattern>();
  private detectionInterval?: NodeJS.Timeout;
  private readonly maxHistorySize = 1000;
  
  private metrics = {
    totalDeadlocks: 0,
    resolvedDeadlocks: 0,
    activeDeadlocks: 0,
    averageResolutionTime: 0,
    patternCount: 0
  };
  
  constructor() {
    super();
    this.startDetectionLoop();
  }
  
  registerTransaction(transactionId: string, info: Omit<DeadlockInfo, 'transactionId'>): void {
    this.activeTransactions.set(transactionId, {
      transactionId,
      ...info
    });
  }
  
  unregisterTransaction(transactionId: string): void {
    this.activeTransactions.delete(transactionId);
  }
  
  recordDeadlock(transactionId: string, error: Error): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      console.warn(`Cannot record deadlock: transaction ${transactionId} not found`);
      return;
    }
    
    const deadlockInfo: DeadlockInfo = {
      ...transaction,
      detectedAt: new Date(),
      errorMessage: error.message
    };
    
    this.deadlockHistory.push(deadlockInfo);
    this.metrics.totalDeadlocks++;
    
    // Maintain history size
    if (this.deadlockHistory.length > this.maxHistorySize) {
      this.deadlockHistory = this.deadlockHistory.slice(-this.maxHistorySize);
    }
    
    // Detect patterns
    this.analyzeDeadlockPattern(deadlockInfo);
    
    console.error(`💀 Deadlock detected: ${transactionId} in ${transaction.testFile}:${transaction.testName}`);
    
    this.emit('deadlockDetected', deadlockInfo);
  }
  
  private startDetectionLoop(): void {
    // Check for potential deadlocks every 5 seconds
    this.detectionInterval = setInterval(() => {
      this.detectPotentialDeadlocks();
    }, 5000);
  }
  
  private detectPotentialDeadlocks(): void {
    const now = Date.now();
    const longRunningTransactions = Array.from(this.activeTransactions.values())
      .filter(t => now - t.startTime.getTime() > 30000); // 30 seconds
    
    if (longRunningTransactions.length > 2) {
      console.warn(`⚠️ Potential deadlock detected: ${longRunningTransactions.length} long-running transactions`);
      
      this.emit('potentialDeadlock', {
        transactionCount: longRunningTransactions.length,
        transactions: longRunningTransactions.map(t => t.transactionId),
        timestamp: new Date()
      });
    }
  }
  
  private analyzeDeadlockPattern(deadlockInfo: DeadlockInfo): void {
    // Simple pattern detection based on test file combinations
    const recentDeadlocks = this.deadlockHistory
      .filter(d => Date.now() - d.detectedAt!.getTime() < 300000) // Last 5 minutes
      .filter(d => d.testFile === deadlockInfo.testFile);
    
    if (recentDeadlocks.length >= 3) {
      const patternId = createHash('sha256')
        .update(`${deadlockInfo.testFile}_${deadlockInfo.isolationLevel}`)
        .digest('hex')
        .substring(0, 8);
      
      if (this.deadlockPatterns.has(patternId)) {
        const pattern = this.deadlockPatterns.get(patternId)!;
        pattern.frequency++;
        pattern.lastOccurrence = new Date();
      } else {
        this.deadlockPatterns.set(patternId, {
          id: patternId,
          transactions: recentDeadlocks.map(d => d.transactionId),
          detectedAt: new Date(),
          frequency: 1,
          lastOccurrence: new Date()
        });
        this.metrics.patternCount++;
      }
      
      console.warn(`🔄 Deadlock pattern detected in ${deadlockInfo.testFile}: ${recentDeadlocks.length} occurrences`);
    }
  }
  
  getReport(): {
    metrics: typeof this.metrics;
    activeTransactions: DeadlockInfo[];
    recentDeadlocks: DeadlockInfo[];
    patterns: DeadlockPattern[];
  } {
    const now = Date.now();
    const recentDeadlocks = this.deadlockHistory
      .filter(d => now - d.detectedAt!.getTime() < 3600000) // Last hour
      .slice(-10); // Last 10
    
    return {
      metrics: { ...this.metrics },
      activeTransactions: Array.from(this.activeTransactions.values()),
      recentDeadlocks,
      patterns: Array.from(this.deadlockPatterns.values())
    };
  }
  
  destroy(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
    }
    this.removeAllListeners();
  }
}