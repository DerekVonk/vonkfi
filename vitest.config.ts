import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // Add timeout for database operations
    testTimeout: 30000,
    // Pool options for handling database connections
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
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
        'run-tests.sh'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      all: true,
      skipFull: false
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './client/src'),
      '@shared': resolve(__dirname, './shared'),
    },
  },
});
