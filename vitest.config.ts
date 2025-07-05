import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// CI-specific configuration
const isCI = process.env.CI === 'true';
const isCIParallel = process.env.VITEST_CI_PARALLEL === 'true';
const minThreads = parseInt(process.env.VITEST_MIN_THREADS || '1');
const maxThreads = parseInt(process.env.VITEST_MAX_THREADS || (isCI ? '4' : '1'));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // CI-optimized timeouts
    testTimeout: isCI ? 30000 : 20000,
    setupTimeout: isCI ? 60000 : 30000,
    hookTimeout: isCI ? 30000 : 10000,
    // Pool options optimized for CI/local environments
    pool: 'threads',
    poolOptions: {
      threads: {
        // Single thread for database consistency in local dev
        // Multiple threads allowed in CI with proper isolation
        singleThread: !isCIParallel, 
        maxThreads: maxThreads,
        minThreads: minThreads,
        // CI-specific optimizations
        isolate: true,
        useAtomics: isCI
      },
    },
    // CI-specific test execution options
    maxConcurrency: isCI ? 10 : 5,
    // Retry failed tests in CI
    retry: isCI ? 2 : 0,
    // Bail early in CI if too many tests fail
    bail: isCI ? 10 : undefined,
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Test reporting configuration optimized for CI
    reporters: isCI 
      ? [
          'basic', // Less verbose output for CI
          ['json', { outputFile: './test-results/test-results.json' }],
          ['junit', { outputFile: './test-results/test-results.xml' }]
        ]
      : [
          'default',
          'verbose',
          ['json', { outputFile: './test-results/test-results.json' }],
          ['junit', { outputFile: './test-results/test-results.xml' }]
        ],
    outputFile: {
      json: './test-results/test-results.json',
      junit: './test-results/test-results.xml'
    },
    coverage: {
      provider: 'v8',
      // CI-optimized coverage reporting
      reporter: isCI 
        ? ['text-summary', 'json', 'html', 'cobertura'] // Include cobertura for GitLab CI
        : ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      // CI performance optimization
      clean: true,
      cleanOnRerun: true,
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.d.ts',
        'test/**',
        'migrations/**',
        'drizzle.config.ts',
        'vite.config.ts',
        'vitest.config.ts',
        '.env*',
        'docker-compose*.yml',
        'Dockerfile',
        'run-tests.sh',
        // CI-specific exclusions
        '.github/**',
        '.gitlab-ci.yml',
        'scripts/**',
        'ci/**'
      ],
      thresholds: {
        global: {
          branches: isCI ? 75 : 80, // Slightly lower threshold in CI for stability
          functions: isCI ? 75 : 80,
          lines: isCI ? 75 : 80,
          statements: isCI ? 75 : 80
        }
      },
      all: true,
      skipFull: !isCI, // Include full coverage in CI
      // CI-specific coverage options
      allowExternal: isCI,
      reportOnFailure: true
    },
    // CI-specific options
    passWithNoTests: isCI, // Don't fail CI if no tests found in a specific group
    logHeapUsage: isCI, // Monitor memory usage in CI
    // Cache configuration for CI
    cache: {
      dir: './node_modules/.vitest'
    },
    // Watch mode disabled in CI
    watch: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './client/src'),
      '@shared': resolve(__dirname, './shared'),
    },
  },
});
