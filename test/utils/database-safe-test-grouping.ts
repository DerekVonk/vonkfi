import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { DatabaseDependencyLevel, TestGroup, ResourceRequirements } from './test-parallelization-engine';

export interface TestFileAnalysis {
  filePath: string;
  relativePath: string;
  dependencyLevel: DatabaseDependencyLevel;
  resourceRequirements: ResourceRequirements;
  estimatedDuration: number;
  isolationRequirements: IsolationRequirement[];
  testCount: number;
  complexity: TestComplexity;
  tags: string[];
  prerequisites: string[];
  conflictsWith: string[];
}

export interface IsolationRequirement {
  type: 'namespace' | 'transaction' | 'schema' | 'database';
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  estimatedOverhead: number; // in milliseconds
}

export interface TestComplexity {
  score: number; // 1-10 complexity score
  factors: {
    databaseOperations: number;
    asyncOperations: number;
    networkCalls: number;
    fileOperations: number;
    cryptographicOperations: number;
    loops: number;
    conditionals: number;
  };
  bottleneckRisk: 'low' | 'medium' | 'high';
}

export interface GroupingStrategy {
  name: string;
  description: string;
  maxGroupSize: number;
  maxParallelism: number;
  isolationStrategy: 'strict' | 'moderate' | 'relaxed';
  loadBalancing: 'size' | 'duration' | 'complexity' | 'dependencies';
}

export class DatabaseSafeTestGrouping {
  private testFiles: Map<string, TestFileAnalysis> = new Map();
  private dependencyGraph: Map<string, string[]> = new Map();
  private conflictMatrix: Map<string, Set<string>> = new Map();
  private groupingStrategies: Map<string, GroupingStrategy> = new Map();
  private analysisCache: Map<string, TestFileAnalysis> = new Map();

  constructor() {
    this.initializeGroupingStrategies();
  }

  private initializeGroupingStrategies(): void {
    // Conservative strategy for production environments
    this.groupingStrategies.set('conservative', {
      name: 'Conservative',
      description: 'Safe parallelization with minimal conflicts',
      maxGroupSize: 5,
      maxParallelism: 2,
      isolationStrategy: 'strict',
      loadBalancing: 'dependencies'
    });

    // Balanced strategy for CI environments
    this.groupingStrategies.set('balanced', {
      name: 'Balanced',
      description: 'Optimal balance of safety and performance',
      maxGroupSize: 8,
      maxParallelism: 4,
      isolationStrategy: 'moderate',
      loadBalancing: 'duration'
    });

    // Aggressive strategy for development environments
    this.groupingStrategies.set('aggressive', {
      name: 'Aggressive',
      description: 'Maximum parallelization for fast feedback',
      maxGroupSize: 12,
      maxParallelism: 8,
      isolationStrategy: 'relaxed',
      loadBalancing: 'size'
    });

    // Performance-optimized strategy
    this.groupingStrategies.set('performance', {
      name: 'Performance Optimized',
      description: 'Optimized for execution speed with intelligent balancing',
      maxGroupSize: 10,
      maxParallelism: 6,
      isolationStrategy: 'moderate',
      loadBalancing: 'complexity'
    });
  }

  /**
   * Analyze all test files in a directory structure
   */
  async analyzeTestDirectory(testDir: string): Promise<Map<string, TestFileAnalysis>> {
    console.log(`🔍 Analyzing test directory: ${testDir}`);
    
    const testFiles = this.findTestFiles(testDir);
    console.log(`Found ${testFiles.length} test files`);

    const analysisPromises = testFiles.map(file => this.analyzeTestFile(file, testDir));
    const analyses = await Promise.allSettled(analysisPromises);

    for (let i = 0; i < analyses.length; i++) {
      const result = analyses[i];
      const filePath = testFiles[i];

      if (result.status === 'fulfilled') {
        this.testFiles.set(filePath, result.value);
      } else {
        console.warn(`Failed to analyze ${filePath}:`, result.reason);
        // Create a conservative analysis for failed files
        this.testFiles.set(filePath, this.createFallbackAnalysis(filePath, testDir));
      }
    }

    // Build dependency graph and conflict matrix
    this.buildDependencyGraph();
    this.buildConflictMatrix();

    console.log(`✅ Analysis complete: ${this.testFiles.size} files processed`);
    return new Map(this.testFiles);
  }

  private findTestFiles(testDir: string): string[] {
    const testFiles: string[] = [];
    
    const scanDirectory = (dir: string): void => {
      try {
        const items = readdirSync(dir);
        
        for (const item of items) {
          const fullPath = join(dir, item);
          const stat = statSync(fullPath);
          
          if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            scanDirectory(fullPath);
          } else if (stat.isFile() && (item.endsWith('.test.ts') || item.endsWith('.test.tsx'))) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Error scanning directory ${dir}:`, error);
      }
    };

    scanDirectory(testDir);
    return testFiles;
  }

  private async analyzeTestFile(filePath: string, baseDir: string): Promise<TestFileAnalysis> {
    // Check cache first
    const cacheKey = this.generateCacheKey(filePath);
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      const relativePath = relative(baseDir, filePath);
      
      const analysis: TestFileAnalysis = {
        filePath,
        relativePath,
        dependencyLevel: this.analyzeDatabaseDependency(content),
        resourceRequirements: this.analyzeResourceRequirements(content),
        estimatedDuration: this.estimateTestDuration(content),
        isolationRequirements: this.analyzeIsolationRequirements(content),
        testCount: this.countTests(content),
        complexity: this.analyzeComplexity(content),
        tags: this.extractTags(content, relativePath),
        prerequisites: this.extractPrerequisites(content),
        conflictsWith: this.extractConflicts(content)
      };

      // Cache the analysis
      this.analysisCache.set(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error);
      return this.createFallbackAnalysis(filePath, baseDir);
    }
  }

  private generateCacheKey(filePath: string): string {
    try {
      const stat = statSync(filePath);
      return createHash('sha256')
        .update(`${filePath}_${stat.mtime.getTime()}_${stat.size}`)
        .digest('hex')
        .substring(0, 16);
    } catch {
      return createHash('sha256').update(filePath).digest('hex').substring(0, 16);
    }
  }

  private analyzeDatabaseDependency(content: string): DatabaseDependencyLevel {
    // Enhanced pattern analysis for database dependencies
    const patterns = {
      noDatabase: [
        /^(?!.*\b(?:pool|client|storage|database|transaction|sql|query)\b).*$/im,
        /describe.*unit.*test/i,
        /it.*pure.*function/i
      ],
      readOnly: [
        /\.(?:select|findMany|findFirst|findUnique|count)\s*\(/g,
        /SELECT\s+[\w\s,*]+\s+FROM/gi,
        /storage\.(?:get|find|list|search)/g,
        /\.query\s*\(\s*['"`]SELECT/gi
      ],
      isolatedWrites: [
        /withTransaction/g,
        /BEGIN\s*;[\s\S]*?COMMIT\s*;/gi,
        /\.(?:create|insert|upsert)\s*\(/g,
        /INSERT\s+INTO/gi,
        /storage\.(?:create|save|add)/g
      ],
      sharedWrites: [
        /\.(?:update|updateMany|delete|deleteMany)\s*\(/g,
        /UPDATE\s+[\w\s]+\s+SET/gi,
        /DELETE\s+FROM/gi,
        /TRUNCATE\s+TABLE/gi,
        /storage\.(?:update|delete|clear|remove)/g
      ],
      schemaChanges: [
        /(?:ALTER|CREATE|DROP)\s+TABLE/gi,
        /(?:CREATE|DROP)\s+(?:INDEX|SEQUENCE|VIEW)/gi,
        /migration/gi,
        /schema.*(?:change|modify|alter)/gi,
        /drizzle.*migrate/gi
      ]
    };

    // Check for schema changes first (highest dependency)
    if (patterns.schemaChanges.some(pattern => pattern.test(content))) {
      return DatabaseDependencyLevel.SCHEMA_CHANGES;
    }

    // Check for shared writes
    if (patterns.sharedWrites.some(pattern => pattern.test(content))) {
      return DatabaseDependencyLevel.SHARED_WRITES;
    }

    // Check for isolated writes
    if (patterns.isolatedWrites.some(pattern => pattern.test(content))) {
      return DatabaseDependencyLevel.ISOLATED_WRITES;
    }

    // Check for read-only operations
    if (patterns.readOnly.some(pattern => pattern.test(content))) {
      return DatabaseDependencyLevel.READ_ONLY;
    }

    // Check if there's any database usage at all
    const hasDatabase = content.includes('storage') || 
                       content.includes('database') || 
                       content.includes('pool') ||
                       content.includes('client.query') ||
                       /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(content);

    return hasDatabase ? DatabaseDependencyLevel.READ_ONLY : DatabaseDependencyLevel.NONE;
  }

  private analyzeResourceRequirements(content: string): ResourceRequirements {
    const requirements: ResourceRequirements = {
      memoryMB: 64, // Base memory
      cpuIntensive: false,
      networkIntensive: false,
      diskIntensive: false,
      databaseConnections: 0
    };

    // CPU-intensive operations
    const cpuPatterns = [
      /crypto\./g, /hash/g, /encrypt/g, /decrypt/g,
      /for\s*\(\s*\w+.*\d{3,}/g, // Large loops
      /performance\.now/g, /benchmark/g,
      /sort\(\)/g, /filter\(.*complex/g,
      /JSON\.parse.*large/g
    ];

    if (cpuPatterns.some(pattern => pattern.test(content))) {
      requirements.cpuIntensive = true;
      requirements.memoryMB += 128;
    }

    // Network-intensive operations
    const networkPatterns = [
      /(?:fetch|axios|request|http)\s*\(/g,
      /supertest/g, /api\.test/g,
      /webhook/g, /external.*service/g
    ];

    if (networkPatterns.some(pattern => pattern.test(content))) {
      requirements.networkIntensive = true;
      requirements.memoryMB += 64;
    }

    // Disk-intensive operations
    const diskPatterns = [
      /fs\.(?:read|write|create|delete)/g,
      /file.*upload/g, /import.*large/g,
      /csv|xml|json.*parse/g,
      /multer|upload/g
    ];

    if (diskPatterns.some(pattern => pattern.test(content))) {
      requirements.diskIntensive = true;
      requirements.memoryMB += 64;
    }

    // Database connections
    const dbOperationCount = (content.match(/(?:pool|client|storage)\./g) || []).length;
    const concurrentOps = (content.match(/Promise\.all|Promise\.allSettled/g) || []).length;
    
    requirements.databaseConnections = Math.min(
      Math.max(1, Math.ceil(dbOperationCount / 10) + concurrentOps),
      5
    );

    requirements.memoryMB += requirements.databaseConnections * 32;

    return requirements;
  }

  private estimateTestDuration(content: string): number {
    const testCount = this.countTests(content);
    if (testCount === 0) return 1000;

    // Base duration factors
    let baseDuration = 500; // 500ms per test
    
    // Adjust for complexity factors
    const asyncOps = (content.match(/await\s+/g) || []).length;
    const queries = (content.match(/(?:SELECT|INSERT|UPDATE|DELETE)/gi) || []).length;
    const networkCalls = (content.match(/(?:fetch|request|http)/g) || []).length;
    const fileOps = (content.match(/fs\.|readFile|writeFile/g) || []).length;
    
    baseDuration += asyncOps * 100;
    baseDuration += queries * 200;
    baseDuration += networkCalls * 500;
    baseDuration += fileOps * 150;

    // Adjust for performance tests (typically longer)
    if (content.includes('performance') || content.includes('benchmark')) {
      baseDuration *= 3;
    }

    // Adjust for integration tests
    if (content.includes('integration') || content.includes('e2e')) {
      baseDuration *= 2;
    }

    return testCount * baseDuration;
  }

  private analyzeIsolationRequirements(content: string): IsolationRequirement[] {
    const requirements: IsolationRequirement[] = [];

    // Schema-level isolation
    if (/(?:ALTER|CREATE|DROP)\s+TABLE/gi.test(content)) {
      requirements.push({
        type: 'schema',
        reason: 'Modifies database schema',
        priority: 'critical',
        estimatedOverhead: 2000
      });
    }

    // Transaction-level isolation
    if (/(?:INSERT|UPDATE|DELETE)/gi.test(content) && /transaction/gi.test(content)) {
      requirements.push({
        type: 'transaction',
        reason: 'Database writes within transactions',
        priority: 'high',
        estimatedOverhead: 500
      });
    }

    // Namespace isolation for shared resources
    if (/shared.*resource|global.*state|singleton/gi.test(content)) {
      requirements.push({
        type: 'namespace',
        reason: 'Accesses shared resources',
        priority: 'normal',
        estimatedOverhead: 200
      });
    }

    // Database isolation for conflicting operations
    if (/TRUNCATE|DROP|ALTER.*USER/gi.test(content)) {
      requirements.push({
        type: 'database',
        reason: 'Potentially destructive database operations',
        priority: 'critical',
        estimatedOverhead: 5000
      });
    }

    return requirements;
  }

  private countTests(content: string): number {
    const testPatterns = [
      /it\s*\(/g,
      /test\s*\(/g,
      /it\.(?:concurrent|sequential|skip|only)\s*\(/g
    ];

    return testPatterns.reduce((count, pattern) => {
      return count + (content.match(pattern) || []).length;
    }, 0);
  }

  private analyzeComplexity(content: string): TestComplexity {
    const factors = {
      databaseOperations: (content.match(/(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/gi) || []).length,
      asyncOperations: (content.match(/await\s+/g) || []).length,
      networkCalls: (content.match(/(?:fetch|request|http|axios)/g) || []).length,
      fileOperations: (content.match(/fs\.|readFile|writeFile|createWriteStream/g) || []).length,
      cryptographicOperations: (content.match(/crypto\.|hash|encrypt|decrypt|sign|verify/g) || []).length,
      loops: (content.match(/for\s*\(|while\s*\(|forEach\s*\(/g) || []).length,
      conditionals: (content.match(/if\s*\(|switch\s*\(|\?\s*:/g) || []).length
    };

    // Calculate complexity score (1-10)
    const weights = {
      databaseOperations: 2,
      asyncOperations: 1.5,
      networkCalls: 3,
      fileOperations: 2,
      cryptographicOperations: 2.5,
      loops: 1,
      conditionals: 0.5
    };

    const rawScore = Object.entries(factors).reduce((score, [key, count]) => {
      return score + count * weights[key as keyof typeof weights];
    }, 0);

    const score = Math.min(10, Math.max(1, Math.ceil(rawScore / 5)));

    // Determine bottleneck risk
    let bottleneckRisk: 'low' | 'medium' | 'high' = 'low';
    if (factors.networkCalls > 5 || factors.databaseOperations > 10 || factors.fileOperations > 5) {
      bottleneckRisk = 'high';
    } else if (factors.asyncOperations > 10 || factors.cryptographicOperations > 3) {
      bottleneckRisk = 'medium';
    }

    return { score, factors, bottleneckRisk };
  }

  private extractTags(content: string, relativePath: string): string[] {
    const tags: string[] = [];

    // Path-based tags
    if (relativePath.includes('performance')) tags.push('performance');
    if (relativePath.includes('security')) tags.push('security');
    if (relativePath.includes('integration')) tags.push('integration');
    if (relativePath.includes('e2e')) tags.push('e2e');
    if (relativePath.includes('api')) tags.push('api');
    if (relativePath.includes('unit')) tags.push('unit');

    // Content-based tags
    if (content.includes('@slow')) tags.push('slow');
    if (content.includes('@fast')) tags.push('fast');
    if (content.includes('@critical')) tags.push('critical');
    if (content.includes('@flaky')) tags.push('flaky');
    if (content.includes('skip')) tags.push('skip');

    // Feature-based tags
    if (content.includes('auth')) tags.push('auth');
    if (content.includes('payment')) tags.push('payment');
    if (content.includes('import')) tags.push('import');
    if (content.includes('export')) tags.push('export');
    if (content.includes('calculation')) tags.push('calculation');

    return [...new Set(tags)]; // Remove duplicates
  }

  private extractPrerequisites(content: string): string[] {
    const prerequisites: string[] = [];

    // Extract dependencies from comments
    const dependsOnMatch = content.match(/@depends\s+(.+)/g);
    if (dependsOnMatch) {
      dependsOnMatch.forEach(match => {
        const deps = match.replace('@depends', '').trim().split(',');
        prerequisites.push(...deps.map(dep => dep.trim()));
      });
    }

    // Extract from beforeAll/beforeEach patterns
    if (content.includes('createUser') || content.includes('setupUser')) {
      prerequisites.push('user-setup');
    }
    if (content.includes('seedData') || content.includes('setupData')) {
      prerequisites.push('data-setup');
    }
    if (content.includes('migration') || content.includes('schema')) {
      prerequisites.push('schema-setup');
    }

    return [...new Set(prerequisites)];
  }

  private extractConflicts(content: string): string[] {
    const conflicts: string[] = [];

    // Extract conflicts from comments
    const conflictsMatch = content.match(/@conflicts\s+(.+)/g);
    if (conflictsMatch) {
      conflictsMatch.forEach(match => {
        const conflictsList = match.replace('@conflicts', '').trim().split(',');
        conflicts.push(...conflictsList.map(conflict => conflict.trim()));
      });
    }

    // Infer conflicts from operations
    if (content.includes('TRUNCATE') || content.includes('clearData')) {
      conflicts.push('data-modification');
    }
    if (content.includes('ALTER TABLE') || content.includes('CREATE TABLE')) {
      conflicts.push('schema-modification');
    }
    if (content.includes('global') || content.includes('singleton')) {
      conflicts.push('global-state');
    }

    return [...new Set(conflicts)];
  }

  private createFallbackAnalysis(filePath: string, baseDir: string): TestFileAnalysis {
    return {
      filePath,
      relativePath: relative(baseDir, filePath),
      dependencyLevel: DatabaseDependencyLevel.SEQUENTIAL_ONLY,
      resourceRequirements: {
        memoryMB: 128,
        cpuIntensive: false,
        networkIntensive: false,
        diskIntensive: false,
        databaseConnections: 1
      },
      estimatedDuration: 30000, // Conservative 30 seconds
      isolationRequirements: [{
        type: 'transaction',
        reason: 'Fallback analysis - conservative isolation',
        priority: 'high',
        estimatedOverhead: 1000
      }],
      testCount: 1,
      complexity: {
        score: 5,
        factors: {
          databaseOperations: 1,
          asyncOperations: 1,
          networkCalls: 0,
          fileOperations: 0,
          cryptographicOperations: 0,
          loops: 0,
          conditionals: 1
        },
        bottleneckRisk: 'medium'
      },
      tags: ['fallback', 'conservative'],
      prerequisites: [],
      conflictsWith: []
    };
  }

  private buildDependencyGraph(): void {
    for (const [filePath, analysis] of this.testFiles) {
      const dependencies: string[] = [];
      
      // Add dependencies based on prerequisites
      for (const prereq of analysis.prerequisites) {
        for (const [otherPath, otherAnalysis] of this.testFiles) {
          if (otherPath !== filePath && otherAnalysis.tags.includes(prereq)) {
            dependencies.push(otherPath);
          }
        }
      }

      this.dependencyGraph.set(filePath, dependencies);
    }
  }

  private buildConflictMatrix(): void {
    for (const [filePath, analysis] of this.testFiles) {
      const conflicts = new Set<string>();
      
      // Add conflicts based on explicit conflicts
      for (const conflict of analysis.conflictsWith) {
        for (const [otherPath, otherAnalysis] of this.testFiles) {
          if (otherPath !== filePath && otherAnalysis.tags.includes(conflict)) {
            conflicts.add(otherPath);
          }
        }
      }

      // Add conflicts based on dependency levels
      if (analysis.dependencyLevel >= DatabaseDependencyLevel.SHARED_WRITES) {
        for (const [otherPath, otherAnalysis] of this.testFiles) {
          if (otherPath !== filePath && 
              otherAnalysis.dependencyLevel >= DatabaseDependencyLevel.SHARED_WRITES) {
            conflicts.add(otherPath);
          }
        }
      }

      this.conflictMatrix.set(filePath, conflicts);
    }
  }

  /**
   * Create optimized test groups using the specified strategy
   */
  createOptimizedGroups(strategy: string = 'balanced'): Map<string, TestGroup> {
    const strategyConfig = this.groupingStrategies.get(strategy);
    if (!strategyConfig) {
      throw new Error(`Unknown grouping strategy: ${strategy}`);
    }

    console.log(`📦 Creating test groups using ${strategy} strategy...`);

    const groups = new Map<string, TestGroup>();
    const processedFiles = new Set<string>();
    
    // Sort files by dependency level and complexity
    const sortedFiles = Array.from(this.testFiles.entries()).sort(([, a], [, b]) => {
      // Higher dependency levels first
      const depDiff = b.dependencyLevel - a.dependencyLevel;
      if (depDiff !== 0) return depDiff;
      
      // Higher complexity second
      return b.complexity.score - a.complexity.score;
    });

    // Create groups for each dependency level
    const levelGroups = new Map<DatabaseDependencyLevel, TestFileAnalysis[]>();
    for (const [filePath, analysis] of sortedFiles) {
      if (!levelGroups.has(analysis.dependencyLevel)) {
        levelGroups.set(analysis.dependencyLevel, []);
      }
      levelGroups.get(analysis.dependencyLevel)!.push(analysis);
    }

    // Process each dependency level
    for (const [level, files] of levelGroups) {
      const levelGroups = this.createGroupsForLevel(files, strategyConfig, level);
      for (const [groupId, group] of levelGroups) {
        groups.set(groupId, group);
      }
    }

    console.log(`✅ Created ${groups.size} optimized test groups`);
    this.logGroupingResults(groups, strategy);

    return groups;
  }

  private createGroupsForLevel(
    files: TestFileAnalysis[],
    strategy: GroupingStrategy,
    level: DatabaseDependencyLevel
  ): Map<string, TestGroup> {
    const groups = new Map<string, TestGroup>();
    const remaining = [...files];

    let groupIndex = 0;
    while (remaining.length > 0) {
      const group = this.createOptimalGroup(remaining, strategy, level, groupIndex++);
      if (group.tests.length === 0) break; // Safety check
      
      const groupId = this.generateGroupId(group);
      groups.set(groupId, group);

      // Remove grouped files from remaining
      for (const testPath of group.tests) {
        const index = remaining.findIndex(f => f.filePath === testPath);
        if (index >= 0) {
          remaining.splice(index, 1);
        }
      }
    }

    return groups;
  }

  private createOptimalGroup(
    availableFiles: TestFileAnalysis[],
    strategy: GroupingStrategy,
    level: DatabaseDependencyLevel,
    groupIndex: number
  ): TestGroup {
    if (availableFiles.length === 0) {
      return this.createEmptyGroup(level, groupIndex);
    }

    const groupFiles: TestFileAnalysis[] = [];
    const maxSize = Math.min(strategy.maxGroupSize, availableFiles.length);
    
    // Start with the first available file
    const seedFile = availableFiles[0];
    groupFiles.push(seedFile);

    // Add compatible files based on strategy
    for (let i = 1; i < availableFiles.length && groupFiles.length < maxSize; i++) {
      const candidate = availableFiles[i];
      
      if (this.areFilesCompatible(groupFiles, candidate, strategy)) {
        groupFiles.push(candidate);
      }
    }

    return this.buildTestGroup(groupFiles, level, groupIndex, strategy);
  }

  private areFilesCompatible(
    groupFiles: TestFileAnalysis[],
    candidate: TestFileAnalysis,
    strategy: GroupingStrategy
  ): boolean {
    // Check for explicit conflicts
    for (const groupFile of groupFiles) {
      if (this.conflictMatrix.get(groupFile.filePath)?.has(candidate.filePath)) {
        return false;
      }
    }

    // Check dependency compatibility
    const groupDependencies = new Set(
      groupFiles.flatMap(f => this.dependencyGraph.get(f.filePath) || [])
    );
    
    if (groupDependencies.has(candidate.filePath)) {
      return false; // Candidate is a dependency of group files
    }

    // Check resource compatibility based on strategy
    const totalMemory = groupFiles.reduce((sum, f) => sum + f.resourceRequirements.memoryMB, 0);
    if (totalMemory + candidate.resourceRequirements.memoryMB > this.getMaxMemoryPerGroup(strategy)) {
      return false;
    }

    // Check isolation compatibility
    if (strategy.isolationStrategy === 'strict') {
      const groupIsolationTypes = new Set(
        groupFiles.flatMap(f => f.isolationRequirements.map(req => req.type))
      );
      const candidateIsolationTypes = candidate.isolationRequirements.map(req => req.type);
      
      // In strict mode, all files must have the same isolation requirements
      if (candidateIsolationTypes.some(type => !groupIsolationTypes.has(type))) {
        return false;
      }
    }

    return true;
  }

  private getMaxMemoryPerGroup(strategy: GroupingStrategy): number {
    const baseMemory = {
      conservative: 256,
      balanced: 512,
      aggressive: 1024,
      performance: 768
    };
    
    return baseMemory[strategy.name.toLowerCase()] || 512;
  }

  private buildTestGroup(
    files: TestFileAnalysis[],
    level: DatabaseDependencyLevel,
    groupIndex: number,
    strategy: GroupingStrategy
  ): TestGroup {
    const testPaths = files.map(f => f.filePath);
    const totalDuration = files.reduce((sum, f) => sum + f.estimatedDuration, 0);
    const totalMemory = files.reduce((sum, f) => sum + f.resourceRequirements.memoryMB, 0);
    const maxConnections = Math.max(...files.map(f => f.resourceRequirements.databaseConnections));
    
    const requiresIsolation = files.some(f => f.isolationRequirements.length > 0);
    const maxParallelism = this.calculateGroupParallelism(level, files.length, strategy);
    
    // Aggregate tags
    const allTags = new Set<string>();
    files.forEach(f => f.tags.forEach(tag => allTags.add(tag)));
    allTags.add(`level-${level}`);
    allTags.add(`strategy-${strategy.name.toLowerCase()}`);

    // Calculate priority
    const hasCriticalTests = files.some(f => f.tags.includes('critical'));
    const hasSecurityTests = files.some(f => f.tags.includes('security'));
    const priority = hasCriticalTests ? 'critical' : hasSecurityTests ? 'high' : 'normal';

    return {
      id: `group-${level}-${groupIndex}`,
      name: `${DatabaseDependencyLevel[level]} Group ${groupIndex}`,
      tests: testPaths,
      dependencyLevel: level,
      estimatedDuration: totalDuration,
      maxParallelism,
      requiresIsolation,
      tags: Array.from(allTags),
      priority: priority as 'low' | 'normal' | 'high' | 'critical',
      resourceRequirements: {
        memoryMB: totalMemory,
        cpuIntensive: files.some(f => f.resourceRequirements.cpuIntensive),
        networkIntensive: files.some(f => f.resourceRequirements.networkIntensive),
        diskIntensive: files.some(f => f.resourceRequirements.diskIntensive),
        databaseConnections: maxConnections
      }
    };
  }

  private calculateGroupParallelism(
    level: DatabaseDependencyLevel,
    fileCount: number,
    strategy: GroupingStrategy
  ): number {
    const baseFactor = {
      conservative: 0.3,
      balanced: 0.6,
      aggressive: 0.9,
      performance: 0.8
    }[strategy.name.toLowerCase()] || 0.6;

    const levelFactor = {
      [DatabaseDependencyLevel.NONE]: 1.0,
      [DatabaseDependencyLevel.READ_ONLY]: 0.8,
      [DatabaseDependencyLevel.ISOLATED_WRITES]: 0.5,
      [DatabaseDependencyLevel.SHARED_WRITES]: 0.2,
      [DatabaseDependencyLevel.SCHEMA_CHANGES]: 0.1,
      [DatabaseDependencyLevel.SEQUENTIAL_ONLY]: 0.0
    }[level] || 0.5;

    const maxParallelism = Math.floor(strategy.maxParallelism * baseFactor * levelFactor);
    return Math.max(1, Math.min(maxParallelism, fileCount));
  }

  private createEmptyGroup(level: DatabaseDependencyLevel, groupIndex: number): TestGroup {
    return {
      id: `empty-group-${level}-${groupIndex}`,
      name: `Empty ${DatabaseDependencyLevel[level]} Group ${groupIndex}`,
      tests: [],
      dependencyLevel: level,
      estimatedDuration: 0,
      maxParallelism: 1,
      requiresIsolation: false,
      tags: ['empty'],
      priority: 'low',
      resourceRequirements: {
        memoryMB: 0,
        cpuIntensive: false,
        networkIntensive: false,
        diskIntensive: false,
        databaseConnections: 0
      }
    };
  }

  private generateGroupId(group: TestGroup): string {
    const content = `${group.dependencyLevel}_${group.tests.join(',')}_${group.estimatedDuration}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 12);
  }

  private logGroupingResults(groups: Map<string, TestGroup>, strategy: string): void {
    console.log(`\n📊 Test Grouping Results (${strategy} strategy):`);
    
    const levelCounts = new Map<DatabaseDependencyLevel, number>();
    let totalTests = 0;
    let totalDuration = 0;

    for (const group of groups.values()) {
      const count = levelCounts.get(group.dependencyLevel) || 0;
      levelCounts.set(group.dependencyLevel, count + 1);
      totalTests += group.tests.length;
      totalDuration += group.estimatedDuration;
    }

    console.log(`  Total Groups: ${groups.size}`);
    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Estimated Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    
    console.log('\n  Groups by Dependency Level:');
    for (const [level, count] of levelCounts) {
      console.log(`    ${DatabaseDependencyLevel[level]}: ${count} groups`);
    }

    // Show memory and parallelism distribution
    const memoryUsage = Array.from(groups.values()).reduce((sum, g) => sum + g.resourceRequirements.memoryMB, 0);
    const avgParallelism = Array.from(groups.values()).reduce((sum, g) => sum + g.maxParallelism, 0) / groups.size;
    
    console.log(`\n  Resource Usage:`);
    console.log(`    Total Memory: ${memoryUsage}MB`);
    console.log(`    Average Parallelism: ${avgParallelism.toFixed(1)}`);
  }

  /**
   * Get analysis for a specific test file
   */
  getFileAnalysis(filePath: string): TestFileAnalysis | undefined {
    return this.testFiles.get(filePath);
  }

  /**
   * Get all available grouping strategies
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.groupingStrategies.keys());
  }

  /**
   * Get strategy details
   */
  getStrategyDetails(strategy: string): GroupingStrategy | undefined {
    return this.groupingStrategies.get(strategy);
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
    console.log('🧹 Analysis cache cleared');
  }
}

export default DatabaseSafeTestGrouping;