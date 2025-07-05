/**
 * Performance optimization configuration for CI/CD environments
 * Provides optimized settings for different CI platforms and test scenarios
 */

module.exports = {
  // CI Platform Detection
  platform: {
    isGitHubActions: process.env.GITHUB_ACTIONS === 'true',
    isGitLabCI: process.env.GITLAB_CI === 'true',
    isJenkins: process.env.JENKINS_URL !== undefined,
    isLocal: !process.env.CI,
  },

  // Node.js Performance Settings
  node: {
    // Memory optimization based on CI environment
    maxOldSpaceSize: (() => {
      if (process.env.GITHUB_ACTIONS) return '6144'; // GitHub Actions has more memory
      if (process.env.GITLAB_CI) return '4096';      // GitLab CI standard
      return '8192'; // Local development
    })(),
    
    maxSemiSpaceSize: '256',
    optimizeForSize: process.env.CI === 'true',
    
    // V8 flags for better performance
    v8Flags: [
      '--max-old-space-size=6144',
      '--max-semi-space-size=256',
      '--optimize-for-size',
      '--no-compilation-cache', // Disable in CI for consistent performance
      '--trace-gc-verbose=false'
    ]
  },

  // Test Execution Configuration
  test: {
    // Parallel execution settings
    parallel: {
      enabled: process.env.CI === 'true',
      minThreads: parseInt(process.env.VITEST_MIN_THREADS) || 1,
      maxThreads: (() => {
        if (process.env.VITEST_MAX_THREADS) return parseInt(process.env.VITEST_MAX_THREADS);
        if (process.env.GITHUB_ACTIONS) return 4;
        if (process.env.GITLAB_CI) return 4;
        return require('os').cpus().length;
      })(),
      poolType: 'threads', // Use worker threads for better isolation
    },

    // Timeout configuration
    timeouts: {
      test: process.env.CI ? 30000 : 20000,        // Individual test timeout
      hook: process.env.CI ? 10000 : 5000,         // Setup/teardown timeout
      teardown: process.env.CI ? 15000 : 10000,    // Global teardown timeout
    },

    // Retry configuration for flaky tests
    retry: {
      enabled: process.env.CI === 'true',
      count: process.env.CI ? 2 : 0,
      delay: 1000, // ms between retries
    },

    // Coverage optimization
    coverage: {
      enabled: true,
      threshold: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      // Skip coverage for faster CI runs when not needed
      skipInPR: false,
      includeUntested: false,
    },
  },

  // Build Performance Configuration
  build: {
    // Vite configuration
    vite: {
      // Enable caching in CI
      cache: {
        enabled: true,
        dir: '.vite',
        // Cache invalidation strategy
        invalidateOnBuild: false,
      },
      
      // Build optimization
      optimization: {
        minify: process.env.NODE_ENV === 'production',
        sourcemap: process.env.CI ? false : 'cheap-source-map',
        target: 'es2020',
        
        // Rollup options for better bundling
        rollup: {
          external: [], // Don't externalize in tests
          treeshake: true,
        },
      },

      // Dev server settings for tests
      server: {
        hmr: false, // Disable HMR in CI
        watch: null, // Disable watching in CI
      },
    },

    // TypeScript compilation
    typescript: {
      // Skip type checking in test runs for speed
      skipLibCheck: true,
      incremental: true,
      tsBuildInfoFile: '.tsbuildinfo',
      
      // Compiler options for CI
      compilerOptions: {
        sourceMap: false,
        declaration: false,
        removeComments: true,
      },
    },
  },

  // Database Performance for Tests
  database: {
    // Connection pool settings for tests
    pool: {
      min: 1,
      max: process.env.CI ? 5 : 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },

    // Test isolation settings
    isolation: {
      enabled: true,
      strategy: 'truncate', // truncate vs transaction rollback
      parallelSafe: true,
    },

    // Migration settings for CI
    migration: {
      timeout: 60000,
      disableTransactions: false,
    },
  },

  // Cache Configuration
  cache: {
    // Dependency caching strategy
    dependencies: {
      // npm/yarn cache settings
      npm: {
        cacheDir: process.env.CI ? '.npm' : undefined,
        preferOffline: process.env.CI === 'true',
        noAudit: process.env.CI === 'true',
      },
      
      // Node modules caching
      nodeModules: {
        symlinks: false,
        preserveSymlinks: false,
      },
    },

    // Build artifacts caching
    artifacts: {
      dist: true,
      coverage: true,
      testResults: true,
      typecheck: true,
    },

    // Cache invalidation rules
    invalidation: {
      onPackageChange: true,
      onConfigChange: true,
      onSourceChange: false, // Don't invalidate on source changes
    },
  },

  // Resource Monitoring
  monitoring: {
    enabled: process.env.MEASURE_PERFORMANCE === 'true',
    
    // Memory monitoring
    memory: {
      logUsage: true,
      warnThreshold: 0.8, // Warn at 80% memory usage
      errorThreshold: 0.95, // Error at 95% memory usage
    },

    // CPU monitoring
    cpu: {
      logUsage: true,
      sampleInterval: 5000, // ms
    },

    // Test timing
    timing: {
      logSlowTests: true,
      slowTestThreshold: 5000, // ms
      logTestDuration: true,
    },
  },

  // Platform-specific optimizations
  platformOptimizations: {
    github: {
      // GitHub Actions specific settings
      cacheVersion: 'v1',
      maxCacheSize: '2GB',
      cacheCompression: true,
      
      // Artifact settings
      artifactRetention: 7, // days
      logLevel: 'info',
    },

    gitlab: {
      // GitLab CI specific settings
      cachePolicy: 'pull-push',
      cacheWhen: 'always',
      artifactExpire: '1 week',
      
      // Resource optimization
      resourceGroup: true,
      interruptible: true,
    },

    local: {
      // Local development settings
      watch: true,
      hmr: true,
      sourcemap: true,
      coverage: false, // Skip coverage in dev
    },
  },

  // Feature Flags
  features: {
    // Experimental features
    experimental: {
      parallelTests: true,
      cacheDependencies: true,
      optimizedReporting: true,
    },

    // Debug features
    debug: {
      logPerformanceMetrics: process.env.DEBUG_PERFORMANCE === 'true',
      profileMemory: process.env.PROFILE_MEMORY === 'true',
      traceExecution: process.env.TRACE_EXECUTION === 'true',
    },
  },

  // Environment-specific overrides
  environments: {
    development: {
      test: {
        parallel: { enabled: false },
        coverage: { enabled: false },
      },
      build: {
        optimization: { minify: false },
      },
    },

    ci: {
      test: {
        parallel: { enabled: true },
        coverage: { enabled: true },
        retry: { enabled: true },
      },
      build: {
        optimization: { minify: true },
      },
    },

    production: {
      test: {
        parallel: { enabled: true, maxThreads: 8 },
        coverage: { enabled: true, threshold: { statements: 90 } },
      },
      build: {
        optimization: { minify: true, sourcemap: false },
      },
    },
  },
};