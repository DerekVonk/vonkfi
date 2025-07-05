# Testing Dependencies Installation Guide

This document lists the additional dependencies needed for the comprehensive testing strategy.

## Required Dependencies

Add these to your `package.json` `devDependencies` section:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@types/bcrypt": "^5.0.2",
    "@types/multer": "^1.4.13", 
    "@types/supertest": "^6.0.3",
    "@vitest/coverage-v8": "^3.2.4",
    "artillery": "^2.0.0",
    "artillery-plugin-metrics-by-endpoint": "^1.0.0",
    "audit-ci": "^6.6.1",
    "codecov": "^3.8.3",
    "eslint": "^8.50.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint-plugin-security": "^1.7.1",
    "wait-on": "^7.2.0"
  }
}
```

## Installation Commands

```bash
# Install Playwright
npm install --save-dev @playwright/test
npx playwright install

# Install Artillery for performance testing
npm install --save-dev artillery artillery-plugin-metrics-by-endpoint

# Install security and audit tools
npm install --save-dev audit-ci eslint-plugin-security

# Install additional test utilities
npm install --save-dev wait-on codecov
```

## VSCode Extensions (Recommended)

For better development experience, install these VSCode extensions:

- **Playwright Test for VSCode**: Run and debug Playwright tests
- **Vitest**: Test explorer for Vitest
- **ESLint**: Code linting
- **GitLens**: Git integration
- **Thunder Client**: API testing

## Browser Installation for E2E Tests

```bash
# Install Playwright browsers
npx playwright install chromium firefox webkit

# Install system dependencies (Linux)
npx playwright install-deps
```

## Docker Setup for CI

Ensure these services are available in your CI environment:

```yaml
# In your GitHub Actions or CI configuration
services:
  postgres:
    image: postgres:15-alpine
    env:
      POSTGRES_DB: vonkfi_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
  
  redis:
    image: redis:7-alpine
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

## Environment Setup

Create these environment files:

1. **`.env.test`** - Copy from `.env.test.example`
2. **`.env.integration`** - Copy from `.env.integration.example`  
3. **`.env.e2e`** - Copy from `.env.e2e.example`
4. **`.env.performance`** - Copy from `.env.performance.example`

## Verification

After installation, verify everything works:

```bash
# Test Vitest
npm run test:unit

# Test Playwright
npm run test:e2e

# Test Artillery
npm run test:performance

# Test security scanning
npm run security:scan

# Test smoke tests
npm run test:smoke
```

## Troubleshooting

### Common Issues

**Playwright browser installation fails:**
```bash
# On Linux, install system dependencies
sudo npx playwright install-deps

# On Docker/CI, use official Playwright image
FROM mcr.microsoft.com/playwright:v1.40.0-focal
```

**Artillery not found:**
```bash
# Install globally if needed
npm install -g artillery
```

**ESLint security config not working:**
```bash
# Ensure security plugin is installed
npm install --save-dev eslint-plugin-security
```

**Database connection issues in tests:**
```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d

# Check connection
npm run db:migrate
```