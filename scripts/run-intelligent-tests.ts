#!/usr/bin/env tsx

import { program } from 'commander';
import { join } from 'path';
import { existsSync } from 'fs';
import IntelligentTestRunner, { IntelligentTestRunnerConfig } from '../test/utils/intelligent-test-runner';
import { IsolationStrategy } from '../test/utils/parallel-execution-framework';

interface CLIOptions {
  testDir: string;
  workers?: number;
  isolation?: string;
  grouping?: string;
  optimization?: string;
  output?: string;
  database?: string;
  verbose?: boolean;
  dryRun?: boolean;
  benchmark?: boolean;
  profile?: boolean;
  maxMemory?: number;
  timeout?: number;
}

async function main() {
  program
    .name('intelligent-test-runner')
    .description('Run tests with intelligent optimization and parallelization')
    .version('1.0.0');

  program
    .option('-d, --test-dir <path>', 'Test directory path', 'test')
    .option('-w, --workers <number>', 'Maximum number of workers', (value) => parseInt(value), 4)
    .option('-i, --isolation <strategy>', 'Isolation strategy (conservative|balanced|aggressive|adaptive)', 'balanced')
    .option('-g, --grouping <strategy>', 'Test grouping strategy (conservative|balanced|aggressive|performance)', 'balanced')
    .option('-o, --optimization <strategy>', 'Optimization strategy (adaptive|parallel_optimization|resource_optimization)', 'adaptive')
    .option('--output <path>', 'Output directory for results', 'test-results')
    .option('--database <url>', 'Database connection URL')
    .option('--max-memory <mb>', 'Maximum memory per worker in MB', (value) => parseInt(value), 512)
    .option('--timeout <ms>', 'Test timeout in milliseconds', (value) => parseInt(value), 300000)
    .option('--verbose', 'Enable verbose logging', false)
    .option('--dry-run', 'Analyze tests without running them', false)
    .option('--benchmark', 'Run in benchmark mode for performance comparison', false)
    .option('--profile', 'Enable detailed profiling', false);

  program.parse();

  const options = program.opts<CLIOptions>();

  console.log('🧠 Intelligent Test Runner');
  console.log('============================');
  
  try {
    await runIntelligentTests(options);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

async function runIntelligentTests(options: CLIOptions): Promise<void> {
  // Validate test directory
  if (!existsSync(options.testDir)) {
    throw new Error(`Test directory not found: ${options.testDir}`);
  }

  // Parse database configuration
  let databaseConfig: any = {
    host: 'localhost',
    port: 5434,
    database: 'vonkfi_test',
    user: 'test',
    password: 'test',
    maxConnections: Math.max(20, options.workers || 4)
  };

  if (options.database) {
    databaseConfig = parseDatabaseUrl(options.database);
  }

  // Validate isolation strategy
  const isolationStrategy = parseIsolationStrategy(options.isolation || 'balanced');

  // Create configuration
  const config: IntelligentTestRunnerConfig = {
    testDirectory: join(process.cwd(), options.testDir),
    maxWorkers: options.workers || 4,
    isolationStrategy,
    groupingStrategy: options.grouping || 'balanced',
    optimizationStrategy: options.optimization || 'adaptive',
    enableHistoricalOptimization: true,
    enablePerformanceMonitoring: true,
    enableResourceManagement: true,
    databaseConfig,
    outputDirectory: join(process.cwd(), options.output || 'test-results'),
    verbose: options.verbose || false
  };

  console.log('📋 Configuration:');
  console.log(`  Test Directory: ${config.testDirectory}`);
  console.log(`  Max Workers: ${config.maxWorkers}`);
  console.log(`  Isolation Strategy: ${config.isolationStrategy}`);
  console.log(`  Grouping Strategy: ${config.groupingStrategy}`);
  console.log(`  Database: ${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`);
  console.log(`  Output: ${config.outputDirectory}`);
  console.log('');

  if (options.dryRun) {
    await runDryRun(config);
  } else if (options.benchmark) {
    await runBenchmark(config);
  } else {
    await runNormalExecution(config);
  }
}

async function runNormalExecution(config: IntelligentTestRunnerConfig): Promise<void> {
  const runner = new IntelligentTestRunner(config);
  
  try {
    console.log('🚀 Starting intelligent test execution...');
    const startTime = Date.now();
    
    const results = await runner.runTests();
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log('\n🎉 Test execution completed successfully!');
    console.log('======================================');
    
    // Summary statistics
    console.log(`📊 Final Results:`);
    console.log(`  Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`  Tests: ${results.totalTests} (${results.passedTests} passed, ${results.failedTests} failed)`);
    console.log(`  Success Rate: ${results.successRate.toFixed(1)}%`);
    console.log(`  Parallelization Efficiency: ${results.parallelizationEfficiency.toFixed(2)}x`);
    
    if (results.optimizationImpact.speedupFactor > 1) {
      console.log(`  Optimization Speedup: ${results.optimizationImpact.speedupFactor.toFixed(2)}x`);
      console.log(`  Time Saved: ${(results.optimizationImpact.timeSavingsMs / 1000).toFixed(2)}s`);
    }
    
    console.log(`  Resource Efficiency: ${results.resourceUtilization.resourceEfficiencyScore.toFixed(1)}/100`);
    
    // Performance comparison
    const sequentialEstimate = calculateSequentialTime(results);
    const actualTime = results.totalDuration;
    const overallSpeedup = sequentialEstimate / actualTime;
    
    console.log('\n⚡ Performance Analysis:');
    console.log(`  Estimated Sequential Time: ${(sequentialEstimate / 1000).toFixed(2)}s`);
    console.log(`  Actual Parallel Time: ${(actualTime / 1000).toFixed(2)}s`);
    console.log(`  Overall Speedup: ${overallSpeedup.toFixed(2)}x`);
    console.log(`  Time Saved: ${((sequentialEstimate - actualTime) / 1000).toFixed(2)}s`);
    
    // Top recommendations
    if (results.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      results.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }
    
    console.log(`\n📁 Detailed results saved to: ${config.outputDirectory}`);
    
  } finally {
    await runner.shutdown();
  }
}

async function runDryRun(config: IntelligentTestRunnerConfig): Promise<void> {
  console.log('🔍 Running analysis (dry run mode)...');
  
  const runner = new IntelligentTestRunner(config);
  
  try {
    await runner.initialize();
    
    // Get status and analysis without running tests
    const status = runner.getStatus();
    
    console.log('\n📊 Analysis Results:');
    console.log(`  Framework Status: ${status.status}`);
    
    if (status.framework) {
      console.log(`  Available Workers: ${config.maxWorkers}`);
      console.log(`  Isolation Strategy: ${config.isolationStrategy}`);
    }
    
    if (status.poolManager) {
      console.log(`  Database Connections: ${status.poolManager.maxDatabaseConnections || 'N/A'}`);
      console.log(`  Pool Status: Available`);
    }
    
    console.log('\n✅ Dry run completed - ready for execution');
    
  } finally {
    await runner.shutdown();
  }
}

async function runBenchmark(config: IntelligentTestRunnerConfig): Promise<void> {
  console.log('🏃 Running benchmark comparison...');
  
  const results: any[] = [];
  
  // Benchmark different strategies
  const strategies: Array<{ name: string; config: Partial<IntelligentTestRunnerConfig> }> = [
    {
      name: 'Conservative Strategy',
      config: { 
        groupingStrategy: 'conservative', 
        isolationStrategy: IsolationStrategy.CONSERVATIVE,
        maxWorkers: 2 
      }
    },
    {
      name: 'Balanced Strategy',
      config: { 
        groupingStrategy: 'balanced', 
        isolationStrategy: IsolationStrategy.BALANCED,
        maxWorkers: config.maxWorkers 
      }
    },
    {
      name: 'Aggressive Strategy',
      config: { 
        groupingStrategy: 'aggressive', 
        isolationStrategy: IsolationStrategy.AGGRESSIVE,
        maxWorkers: config.maxWorkers || 4
      }
    }
  ];
  
  for (const strategy of strategies) {
    console.log(`\n📊 Testing ${strategy.name}...`);
    
    const strategyConfig = { ...config, ...strategy.config };
    const runner = new IntelligentTestRunner(strategyConfig);
    
    try {
      const startTime = Date.now();
      const result = await runner.runTests();
      const endTime = Date.now();
      
      results.push({
        strategy: strategy.name,
        duration: endTime - startTime,
        successRate: result.successRate,
        parallelizationEfficiency: result.parallelizationEfficiency,
        resourceEfficiency: result.resourceUtilization.resourceEfficiencyScore
      });
      
      console.log(`  ✅ ${strategy.name}: ${((endTime - startTime) / 1000).toFixed(2)}s`);
      
    } catch (error) {
      console.log(`  ❌ ${strategy.name} failed:`, error.message);
    } finally {
      await runner.shutdown();
    }
  }
  
  // Display benchmark results
  console.log('\n🏆 Benchmark Results:');
  console.log('=====================');
  
  results.sort((a, b) => a.duration - b.duration);
  
  results.forEach((result, index) => {
    const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
    console.log(`${rank} ${result.strategy}:`);
    console.log(`     Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`     Success Rate: ${result.successRate.toFixed(1)}%`);
    console.log(`     Parallelization: ${result.parallelizationEfficiency.toFixed(2)}x`);
    console.log(`     Resource Efficiency: ${result.resourceEfficiency.toFixed(1)}/100`);
    console.log('');
  });
  
  const fastest = results[0];
  const slowest = results[results.length - 1];
  const speedupFactor = slowest.duration / fastest.duration;
  
  console.log(`🎯 Best Strategy: ${fastest.strategy}`);
  console.log(`⚡ Performance Difference: ${speedupFactor.toFixed(2)}x faster than slowest`);
}

function parseDatabaseUrl(url: string): any {
  // Simple URL parsing for postgresql://user:password@host:port/database
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (match) {
    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4]),
      database: match[5],
      maxConnections: 20
    };
  }
  
  throw new Error(`Invalid database URL format: ${url}`);
}

function parseIsolationStrategy(strategy: string): IsolationStrategy {
  switch (strategy.toLowerCase()) {
    case 'conservative':
      return IsolationStrategy.CONSERVATIVE;
    case 'balanced':
      return IsolationStrategy.BALANCED;
    case 'aggressive':
      return IsolationStrategy.AGGRESSIVE;
    case 'adaptive':
      return IsolationStrategy.ADAPTIVE;
    default:
      throw new Error(`Invalid isolation strategy: ${strategy}`);
  }
}

function calculateSequentialTime(results: any): number {
  // Estimate sequential execution time based on group durations
  return results.detailedResults.reduce((sum: number, group: any) => sum + group.duration, 0);
}

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}