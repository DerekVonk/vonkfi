/**
 * Unified Transfer Recommendation Engine
 * Integrates all systems with comprehensive validation, error handling, and edge case management
 */

import { Account, Goal, Transaction, TransferPreference } from '@shared/schema';
import { FireCalculator } from './fireCalculations';
import { IntelligentTransferOptimizer, IntelligentTransferRecommendation } from './intelligentTransferOptimizer';
import { TransferDestinationService } from './transferDestinationService';
import { TransferValidator, ValidationResult, TransferValidationContext } from '../validation/transferValidation';
import { concurrencyController, withTransaction } from '../utils/concurrencyControl';
import { 
  transferRecommendationRecovery, 
  GracefulDegradation, 
  ErrorClassifier, 
  ErrorType 
} from '../utils/errorRecovery';
import { 
  validateTransferAmount, 
  addCurrency, 
  subtractCurrency, 
  compareCurrency, 
  distributeAmount, 
  roundCurrency 
} from '../utils/currencyUtils';
import { logger } from '../middleware/logging';

export interface UnifiedRecommendationRequest {
  userId: number;
  forceRecalculation?: boolean;
  includeIntelligentRecommendations?: boolean;
  maxRecommendations?: number;
  minTransferAmount?: string;
}

export interface UnifiedRecommendationResponse {
  success: boolean;
  recommendations: TransferRecommendation[];
  allocation: AllocationRecommendation;
  summary: RecommendationSummary;
  metadata: RecommendationMetadata;
  warnings?: string[];
  errors?: string[];
}

export interface TransferRecommendation {
  id?: number;
  userId: number;
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  purpose: string;
  priority: 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'weekly' | 'monthly';
  confidence: number;
  goalId?: number;
  validUntil?: Date;
  estimatedImpact?: {
    savingsRate: number;
    riskReduction: number;
    opportunityCost: number;
  };
}

export interface AllocationRecommendation {
  pocketMoney: number;
  essentialExpenses: number;
  bufferAllocation: number;
  excessForGoals: number;
  goalAllocations: { goalId: number; amount: number }[];
  totalAllocated: number;
  remainingAmount: number;
}

export interface RecommendationSummary {
  totalRecommended: number;
  numberOfTransfers: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  averageConfidence: number;
  totalPotentialImpact: number;
}

export interface RecommendationMetadata {
  generatedAt: Date;
  engineVersion: string;
  validationPassed: boolean;
  dataQuality: 'excellent' | 'good' | 'fair' | 'poor';
  recommendationStrategy: 'intelligent' | 'basic' | 'fallback';
  processingTimeMs: number;
  warningsCount: number;
  errorsCount: number;
}

/**
 * Main unified transfer recommendation engine
 */
export class UnifiedTransferRecommendationEngine {
  private readonly fireCalculator: FireCalculator;
  private readonly intelligentOptimizer: IntelligentTransferOptimizer;
  private readonly destinationService: TransferDestinationService;
  private readonly validator: TransferValidator;
  
  private readonly ENGINE_VERSION = '2.0.0';
  private readonly MAX_PROCESSING_TIME = 30000; // 30 seconds
  private readonly DEFAULT_MIN_TRANSFER = '10.00';

  constructor() {
    this.fireCalculator = new FireCalculator();
    this.intelligentOptimizer = new IntelligentTransferOptimizer();
    this.destinationService = new TransferDestinationService();
    this.validator = new TransferValidator();
  }

  /**
   * Main entry point for generating transfer recommendations
   */
  async generateRecommendations(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext
  ): Promise<UnifiedRecommendationResponse> {
    const startTime = Date.now();
    
    return concurrencyController.withTransferRecommendationLock(
      request.userId,
      async () => {
        return transferRecommendationRecovery.executeWithRecovery(
          () => this.executeRecommendationGeneration(request, context, startTime),
          () => this.getFallbackRecommendations(request, context, startTime),
          { allowPartialFailure: true }
        );
      },
      this.MAX_PROCESSING_TIME
    );
  }

  /**
   * Core recommendation generation logic
   */
  private async executeRecommendationGeneration(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext,
    startTime: number
  ): Promise<UnifiedRecommendationResponse> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // 1. Validate input context
      const validation = await this.validator.validateContext(context);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      warnings.push(...validation.warnings);

      // 2. Assess data quality
      const dataQuality = this.assessDataQuality(context);
      if (dataQuality === 'poor') {
        warnings.push('Data quality is poor - recommendations may be limited');
      }

      // 3. Generate recommendations using appropriate strategy
      const strategy = this.selectRecommendationStrategy(request, context, dataQuality);
      const { recommendations, allocation } = await this.generateByStrategy(
        strategy, 
        request, 
        context
      );

      // 4. Post-process and validate recommendations
      const processedRecommendations = await this.postProcessRecommendations(
        recommendations,
        context,
        request
      );

      // 5. Generate summary and metadata
      const summary = this.generateSummary(processedRecommendations);
      const metadata = this.generateMetadata(
        startTime,
        strategy,
        dataQuality,
        validation,
        warnings.length,
        errors.length
      );

      return {
        success: true,
        recommendations: processedRecommendations,
        allocation,
        summary,
        metadata,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      logger.error('Recommendation generation failed', {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      // Classify error and decide on fallback strategy
      const errorType = ErrorClassifier.classify(error);
      if (errorType === ErrorType.BUSINESS_LOGIC || errorType === ErrorType.PERMANENT) {
        throw error; // Don't retry these
      }

      // For other errors, let the recovery system handle it
      throw error;
    }
  }

  /**
   * Selects the appropriate recommendation strategy
   */
  private selectRecommendationStrategy(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext,
    dataQuality: string
  ): 'intelligent' | 'basic' | 'fallback' {
    // Use intelligent strategy if explicitly requested and data quality is good
    if (request.includeIntelligentRecommendations && dataQuality !== 'poor') {
      return 'intelligent';
    }

    // Use basic strategy for normal cases
    if (dataQuality === 'excellent' || dataQuality === 'good') {
      return 'basic';
    }

    // Use fallback for poor data quality
    return 'fallback';
  }

  /**
   * Generates recommendations based on selected strategy
   */
  private async generateByStrategy(
    strategy: 'intelligent' | 'basic' | 'fallback',
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext
  ): Promise<{ recommendations: TransferRecommendation[]; allocation: AllocationRecommendation }> {
    
    switch (strategy) {
      case 'intelligent':
        return this.generateIntelligentRecommendations(request, context);
      
      case 'basic':
        return this.generateBasicRecommendations(request, context);
      
      case 'fallback':
        return this.generateFallbackRecommendations(request, context);
      
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  /**
   * Generates intelligent recommendations using AI-enhanced optimizer
   */
  private async generateIntelligentRecommendations(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext
  ): Promise<{ recommendations: TransferRecommendation[]; allocation: AllocationRecommendation }> {
    
    // Get categories for intelligent analysis
    const categories: any[] = []; // TODO: Get from storage if needed
    
    const intelligentRecs = await this.intelligentOptimizer.generateIntelligentRecommendations(
      context.userId,
      context.transactions,
      context.accounts,
      context.goals,
      context.transferPreferences,
      categories
    );

    // Convert intelligent recommendations to unified format
    const recommendations = intelligentRecs.map(rec => this.convertIntelligentRecommendation(rec));

    // Generate allocation based on recommendations
    const allocation = this.calculateAllocationFromRecommendations(recommendations, context);

    return { recommendations, allocation };
  }

  /**
   * Generates basic recommendations using FIRE calculator
   */
  private async generateBasicRecommendations(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext
  ): Promise<{ recommendations: TransferRecommendation[]; allocation: AllocationRecommendation }> {
    
    // Calculate FIRE metrics
    const fireMetrics = this.fireCalculator.calculateMetrics(
      context.transactions,
      context.goals,
      context.accounts
    );

    // Generate allocation recommendation
    const allocation = this.fireCalculator.calculateAllocationRecommendation(
      fireMetrics.monthlyIncome,
      fireMetrics.monthlyExpenses,
      fireMetrics.bufferStatus.current,
      context.goals
    );

    // Convert allocation to transfer recommendations
    const recommendations = await this.convertAllocationToRecommendations(
      allocation,
      context,
      request
    );

    return { 
      recommendations, 
      allocation: this.normalizeAllocation(allocation) 
    };
  }

  /**
   * Generates fallback recommendations for edge cases
   */
  private async generateFallbackRecommendations(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext
  ): Promise<{ recommendations: TransferRecommendation[]; allocation: AllocationRecommendation }> {
    
    const recommendations: TransferRecommendation[] = [];
    const allocation = GracefulDegradation.getFallbackAllocation();

    // Try to generate minimal safe recommendations
    const mainAccount = context.accounts.find(a => a.role === 'income') || context.accounts[0];
    
    if (mainAccount && context.accounts.length > 1) {
      const availableBalance = parseFloat(mainAccount.balance || '0');
      const minTransfer = parseFloat(request.minTransferAmount || this.DEFAULT_MIN_TRANSFER);
      
      if (availableBalance > minTransfer * 2) {
        // Try to recommend a basic emergency fund transfer
        const emergencyAccount = context.accounts.find(a => a.role === 'emergency');
        if (emergencyAccount) {
          const transferAmount = Math.min(availableBalance * 0.1, 100); // 10% or €100, whichever is less
          
          recommendations.push({
            userId: context.userId,
            fromAccountId: mainAccount.id,
            toAccountId: emergencyAccount.id,
            amount: roundCurrency(transferAmount),
            purpose: 'Emergency fund contribution (automatic)',
            priority: 'medium',
            urgency: 'monthly',
            confidence: 0.6
          });
        }
      }
    }

    return { recommendations, allocation: this.normalizeAllocation(allocation) };
  }

  /**
   * Converts allocation to transfer recommendations
   */
  private async convertAllocationToRecommendations(
    allocation: any,
    context: TransferValidationContext,
    request: UnifiedRecommendationRequest
  ): Promise<TransferRecommendation[]> {
    const recommendations: TransferRecommendation[] = [];
    const mainAccount = context.accounts.find(a => a.role === 'income') || context.accounts[0];

    if (!mainAccount) {
      return recommendations;
    }

    // Buffer allocation
    if (allocation.bufferAllocation > 0) {
      const destination = this.destinationService.resolveDestination(
        'buffer',
        context.accounts,
        context.goals,
        context.transferPreferences
      );

      if (destination) {
        const amountValidation = validateTransferAmount(allocation.bufferAllocation);
        if (amountValidation.valid) {
          recommendations.push({
            userId: context.userId,
            fromAccountId: mainAccount.id,
            toAccountId: destination.accountId,
            amount: roundCurrency(allocation.bufferAllocation),
            purpose: destination.purpose,
            priority: 'high',
            urgency: 'weekly',
            confidence: destination.confidence === 'high' ? 0.9 : 0.7
          });
        }
      }
    }

    // Goal allocations
    for (const goalAllocation of allocation.goalAllocations) {
      const destination = this.destinationService.resolveDestination(
        'goal',
        context.accounts,
        context.goals,
        context.transferPreferences,
        goalAllocation.goalId
      );

      if (destination) {
        const amountValidation = validateTransferAmount(goalAllocation.amount);
        if (amountValidation.valid) {
          recommendations.push({
            userId: context.userId,
            fromAccountId: mainAccount.id,
            toAccountId: destination.accountId,
            amount: roundCurrency(goalAllocation.amount),
            purpose: destination.purpose,
            priority: 'medium',
            urgency: 'monthly',
            confidence: destination.confidence === 'high' ? 0.8 : 0.6,
            goalId: goalAllocation.goalId
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Post-processes recommendations to ensure validity
   */
  private async postProcessRecommendations(
    recommendations: TransferRecommendation[],
    context: TransferValidationContext,
    request: UnifiedRecommendationRequest
  ): Promise<TransferRecommendation[]> {
    const processedRecommendations: TransferRecommendation[] = [];
    const maxRecommendations = request.maxRecommendations || 10;
    const minTransferAmount = request.minTransferAmount || this.DEFAULT_MIN_TRANSFER;

    for (const rec of recommendations) {
      // Validate each recommendation
      const validation = await this.validator.validateTransferRequest(
        {
          fromAccountId: rec.fromAccountId,
          toAccountId: rec.toAccountId,
          amount: rec.amount,
          purpose: rec.purpose,
          goalId: rec.goalId
        },
        context
      );

      if (validation.valid) {
        // Check minimum amount
        if (compareCurrency(rec.amount, minTransferAmount) >= 0) {
          // Add validity period
          rec.validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          processedRecommendations.push(rec);
        }
      } else {
        logger.warn('Invalid recommendation filtered out', {
          recommendation: rec,
          errors: validation.errors
        });
      }

      // Stop if we've reached the maximum
      if (processedRecommendations.length >= maxRecommendations) {
        break;
      }
    }

    // Sort by priority and confidence
    return processedRecommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  }

  /**
   * Converts intelligent recommendation to unified format
   */
  private convertIntelligentRecommendation(rec: IntelligentTransferRecommendation): TransferRecommendation {
    return {
      userId: rec.userId,
      fromAccountId: rec.fromAccountId,
      toAccountId: rec.toAccountId,
      amount: rec.amount,
      purpose: rec.reason,
      priority: rec.priority,
      urgency: rec.urgency,
      confidence: rec.confidence,
      estimatedImpact: rec.expectedImpact
    };
  }

  /**
   * Calculates allocation from recommendations
   */
  private calculateAllocationFromRecommendations(
    recommendations: TransferRecommendation[],
    context: TransferValidationContext
  ): AllocationRecommendation {
    const bufferRecs = recommendations.filter(r => r.purpose.toLowerCase().includes('buffer') || r.purpose.toLowerCase().includes('emergency'));
    const goalRecs = recommendations.filter(r => r.goalId);

    const bufferAllocation = bufferRecs.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const goalAllocations = goalRecs.map(r => ({
      goalId: r.goalId!,
      amount: parseFloat(r.amount)
    }));

    const totalAllocated = recommendations.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    return {
      pocketMoney: 0, // Not calculated in intelligent mode
      essentialExpenses: 0, // Not calculated in intelligent mode
      bufferAllocation,
      excessForGoals: goalAllocations.reduce((sum, g) => sum + g.amount, 0),
      goalAllocations,
      totalAllocated,
      remainingAmount: 0 // Would need to calculate from account balances
    };
  }

  /**
   * Normalizes allocation to ensure consistency
   */
  private normalizeAllocation(allocation: any): AllocationRecommendation {
    const goalAllocations = Array.isArray(allocation.goalAllocations) 
      ? allocation.goalAllocations 
      : [];

    const totalAllocated = (allocation.pocketMoney || 0) + 
                          (allocation.essentialExpenses || 0) + 
                          (allocation.bufferAllocation || 0) + 
                          goalAllocations.reduce((sum: number, g: any) => sum + (g.amount || 0), 0);

    return {
      pocketMoney: allocation.pocketMoney || 0,
      essentialExpenses: allocation.essentialExpenses || 0,
      bufferAllocation: allocation.bufferAllocation || 0,
      excessForGoals: allocation.excessForGoals || 0,
      goalAllocations,
      totalAllocated,
      remainingAmount: allocation.remainingAmount || 0
    };
  }

  /**
   * Generates recommendation summary
   */
  private generateSummary(recommendations: TransferRecommendation[]): RecommendationSummary {
    const totalRecommended = recommendations.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const counts = recommendations.reduce((acc, r) => {
      acc[r.priority]++;
      return acc;
    }, { high: 0, medium: 0, low: 0 });

    const averageConfidence = recommendations.length > 0 
      ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length 
      : 0;

    const totalPotentialImpact = recommendations.reduce((sum, r) => {
      return sum + (r.estimatedImpact?.savingsRate || 0);
    }, 0);

    return {
      totalRecommended,
      numberOfTransfers: recommendations.length,
      highPriorityCount: counts.high,
      mediumPriorityCount: counts.medium,
      lowPriorityCount: counts.low,
      averageConfidence,
      totalPotentialImpact
    };
  }

  /**
   * Generates metadata for the recommendation response
   */
  private generateMetadata(
    startTime: number,
    strategy: string,
    dataQuality: string,
    validation: ValidationResult,
    warningsCount: number,
    errorsCount: number
  ): RecommendationMetadata {
    return {
      generatedAt: new Date(),
      engineVersion: this.ENGINE_VERSION,
      validationPassed: validation.valid,
      dataQuality: dataQuality as any,
      recommendationStrategy: strategy as any,
      processingTimeMs: Date.now() - startTime,
      warningsCount,
      errorsCount
    };
  }

  /**
   * Assesses data quality for strategy selection
   */
  private assessDataQuality(context: TransferValidationContext): 'excellent' | 'good' | 'fair' | 'poor' {
    let score = 0;

    // Account quality
    if (context.accounts.length >= 3) score += 25;
    else if (context.accounts.length >= 2) score += 15;
    else if (context.accounts.length >= 1) score += 10;

    // Transaction history quality
    if (context.transactions.length >= 100) score += 25;
    else if (context.transactions.length >= 50) score += 20;
    else if (context.transactions.length >= 20) score += 15;
    else if (context.transactions.length >= 5) score += 10;

    // Goal setting quality
    if (context.goals.length >= 3) score += 25;
    else if (context.goals.length >= 2) score += 15;
    else if (context.goals.length >= 1) score += 10;

    // Configuration quality
    if (context.transferPreferences.length > 0) score += 25;

    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Provides fallback recommendations when main generation fails
   */
  private async getFallbackRecommendations(
    request: UnifiedRecommendationRequest,
    context: TransferValidationContext,
    startTime: number
  ): Promise<UnifiedRecommendationResponse> {
    logger.warn('Using fallback recommendation generation', { userId: request.userId });

    const allocation = GracefulDegradation.getFallbackAllocation();
    const recommendations = await GracefulDegradation.getFallbackRecommendations(request.userId);
    
    return {
      success: true,
      recommendations,
      allocation: this.normalizeAllocation(allocation),
      summary: this.generateSummary(recommendations),
      metadata: {
        generatedAt: new Date(),
        engineVersion: this.ENGINE_VERSION,
        validationPassed: false,
        dataQuality: 'poor',
        recommendationStrategy: 'fallback',
        processingTimeMs: Date.now() - startTime,
        warningsCount: 1,
        errorsCount: 0
      },
      warnings: ['Using fallback recommendations due to system issues']
    };
  }
}