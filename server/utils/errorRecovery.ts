/**
 * Error recovery and resilience utilities for transfer operations
 * Implements circuit breaker, retry logic, and graceful degradation
 */

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, blocking requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitoringWindow: number;
}

/**
 * Error classification for different recovery strategies
 */
export enum ErrorType {
  TRANSIENT = 'transient',           // Temporary errors (network, timeout)
  BUSINESS_LOGIC = 'business_logic', // Validation errors, insufficient funds
  SYSTEM = 'system',                 // Database errors, internal errors
  PERMANENT = 'permanent'            // Data corruption, invalid state
}

/**
 * Error classifier to determine retry strategy
 */
export class ErrorClassifier {
  /**
   * Classifies an error to determine appropriate recovery strategy
   */
  static classify(error: any): ErrorType {
    if (!error) return ErrorType.SYSTEM;

    const message = error.message?.toLowerCase() || '';
    const code = error.code || '';

    // Business logic errors - don't retry
    if (message.includes('insufficient funds') ||
        message.includes('invalid amount') ||
        message.includes('same account') ||
        message.includes('not found') ||
        message.includes('unauthorized') ||
        message.includes('completed goal')) {
      return ErrorType.BUSINESS_LOGIC;
    }

    // Database connection errors - retry with backoff
    if (message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('deadlock') ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND') {
      return ErrorType.TRANSIENT;
    }

    // Data integrity errors - don't retry
    if (message.includes('constraint') ||
        message.includes('duplicate') ||
        message.includes('invalid state') ||
        message.includes('corruption')) {
      return ErrorType.PERMANENT;
    }

    // System errors - limited retry
    return ErrorType.SYSTEM;
  }

  /**
   * Determines if an error is retryable
   */
  static isRetryable(error: any): boolean {
    const type = this.classify(error);
    return type === ErrorType.TRANSIENT || type === ErrorType.SYSTEM;
  }
}

/**
 * Retry utility with exponential backoff
 */
export class RetryHandler {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...config
    };
  }

  /**
   * Executes a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.config, ...customConfig };
    let lastError: any;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt++;

        // Don't retry if error is not retryable
        if (!ErrorClassifier.isRetryable(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt >= config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt - 1, config);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculates delay for exponential backoff
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker for preventing cascade failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private successes = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      successThreshold: 3,
      monitoringWindow: 300000, // 5 minutes
      ...config
    };
  }

  /**
   * Executes a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.config.recoveryTimeout) {
        throw new Error('Circuit breaker is OPEN - operation blocked');
      } else {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handles successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  /**
   * Handles failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
      }
    }
  }

  /**
   * Gets current circuit breaker status
   */
  getStatus(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes
    };
  }

  /**
   * Manually resets the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Graceful degradation handler
 */
export class GracefulDegradation {
  /**
   * Provides fallback for transfer recommendation generation
   */
  static async getFallbackRecommendations(userId: number): Promise<any[]> {
    return []; // Return empty recommendations as safe fallback
  }

  /**
   * Provides fallback for FIRE metrics calculation
   */
  static getFallbackFireMetrics(): any {
    return {
      monthlyIncome: 0,
      monthlyExpenses: 0,
      savingsRate: 0,
      fireProgress: 0,
      timeToFire: 0,
      currentMonth: new Date().toISOString().substring(0, 7),
      monthlyBreakdown: [],
      bufferStatus: {
        current: 0,
        target: 0,
        status: 'below' as const
      },
      volatility: {
        average: 0,
        standardDeviation: 0,
        coefficientOfVariation: 0,
        score: 'low' as const
      }
    };
  }

  /**
   * Provides fallback allocation when calculation fails
   */
  static getFallbackAllocation(): any {
    return {
      pocketMoney: 0,
      essentialExpenses: 0,
      bufferAllocation: 0,
      excessForGoals: 0,
      goalAllocations: []
    };
  }

  /**
   * Determines if partial results are acceptable
   */
  static isPartialResultAcceptable(result: any, requiredFields: string[]): boolean {
    if (!result || typeof result !== 'object') {
      return false;
    }

    return requiredFields.every(field => result.hasOwnProperty(field));
  }
}

/**
 * Error recovery coordinator
 */
export class ErrorRecoveryCoordinator {
  private readonly retryHandler: RetryHandler;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitConfig?: Partial<CircuitBreakerConfig>
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
    this.circuitBreaker = new CircuitBreaker(circuitConfig);
  }

  /**
   * Executes a function with full error recovery
   */
  async executeWithRecovery<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T> | T,
    options?: {
      retryConfig?: Partial<RetryConfig>;
      skipCircuitBreaker?: boolean;
      allowPartialFailure?: boolean;
    }
  ): Promise<T> {
    const execute = options?.skipCircuitBreaker 
      ? () => this.retryHandler.execute(fn, options?.retryConfig)
      : () => this.circuitBreaker.execute(() => this.retryHandler.execute(fn, options?.retryConfig));

    try {
      return await execute();
    } catch (error) {
      // Log the error for monitoring
      console.error('Operation failed after recovery attempts:', {
        error: error.message,
        stack: error.stack,
        errorType: ErrorClassifier.classify(error),
        circuitState: this.circuitBreaker.getStatus()
      });

      // Try fallback if available
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          console.warn('Using fallback result due to primary operation failure');
          return fallbackResult;
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }

      // Re-throw original error if no fallback or fallback failed
      throw error;
    }
  }

  /**
   * Gets current health status
   */
  getHealthStatus(): {
    circuitBreaker: ReturnType<CircuitBreaker['getStatus']>;
    isHealthy: boolean;
  } {
    const circuitStatus = this.circuitBreaker.getStatus();
    return {
      circuitBreaker: circuitStatus,
      isHealthy: circuitStatus.state !== CircuitState.OPEN
    };
  }

  /**
   * Resets all error recovery mechanisms
   */
  reset(): void {
    this.circuitBreaker.reset();
  }
}

/**
 * Global error recovery coordinators for different services
 */
export const transferRecommendationRecovery = new ErrorRecoveryCoordinator(
  { maxAttempts: 3, baseDelay: 1000 },
  { failureThreshold: 5, recoveryTimeout: 60000 }
);

export const transferExecutionRecovery = new ErrorRecoveryCoordinator(
  { maxAttempts: 2, baseDelay: 500 },
  { failureThreshold: 3, recoveryTimeout: 30000 }
);

export const dataAccessRecovery = new ErrorRecoveryCoordinator(
  { maxAttempts: 3, baseDelay: 2000 },
  { failureThreshold: 10, recoveryTimeout: 120000 }
);