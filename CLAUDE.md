# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VonkFi is a full-stack personal finance management platform focused on FIRE (Financial Independence/Retire Early) planning. The application imports bank statements in CAMT.053 XML format, categorizes transactions, provides zero-based budgeting, and generates intelligent transfer recommendations.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Wouter (routing) + TanStack Query + Radix UI + Tailwind CSS
- Backend: Express + TypeScript + Drizzle ORM + PostgreSQL
- Testing: Vitest + Playwright + React Testing Library
- Infrastructure: Docker + Docker Compose + Redis (optional, for caching)

## Development Commands

### Essential Commands
```bash
# Development
npm run dev                    # Start dev server (port 5000, Express serves both API and Vite)

# Database
npm run db:push               # Push schema changes to database
npm run db:generate           # Generate migration files
npm run db:migrate            # Run migrations
npm run db:studio             # Open Drizzle Studio GUI

# Testing
npm test                      # Run tests in watch mode
npm run test:run              # Run tests once
npm run test:coverage         # Run with coverage report
./run-tests.sh                # Run tests with Docker test database (recommended)
npm run test:e2e              # Run Playwright e2e tests
npm run test:e2e:headed       # Run e2e tests with browser UI
npm run test:e2e:debug        # Debug e2e tests

# Building
npm run build                 # Build for production (Vite + esbuild)
npm run check                 # TypeScript type checking
npm start                     # Start production server

# Docker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d  # Dev with admin tools
docker-compose up -d          # Production mode
```

### Running a Single Test
```bash
# Run specific test file
npm test path/to/test.test.ts

# Run specific test file once (no watch)
npm run test:run path/to/test.test.ts

# Run test with verbose output
npm run test:run path/to/test.test.ts -- --reporter=verbose

# Example: Run internal transfer detection tests
npm run test:run test/transfer-recommendations.test.ts --reporter=verbose
```

### Database Setup for Development
```bash
# For tests: Use the test script which manages Docker containers
./run-tests.sh

# For development: Use Docker Compose with dev configuration
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Access admin interfaces in dev mode:
# - pgAdmin: http://localhost:8080
# - Redis Admin: http://localhost:8081
```

### Working with Scripts
```bash
# Detect internal transfers in existing data
DATABASE_URL=<your_db_url> tsx server/scripts/detectInternalTransfers.ts

# Seed test data
npm run db:seed:test
npm run db:seed:e2e
npm run db:seed:performance
```

## Architecture Overview

### Monorepo Structure
- **`client/`** - React frontend with lazy-loaded routes
- **`server/`** - Express backend with middleware, routes, services
- **`shared/`** - Shared TypeScript types and Drizzle schema
- **`test/`** - Vitest test suites
- **`migrations/`** - Drizzle ORM migration files
- **`scripts/`** - Build, deployment, and data processing scripts

### Backend Architecture

**Single Entry Point:** `server/index.ts` creates Express app, registers routes, sets up Vite in dev mode

**Key Patterns:**
1. **Storage Layer** (`server/storage.ts`): Implements `IStorage` interface with all database operations using Drizzle ORM. All database queries go through this abstraction.

2. **Route Registration** (`server/routes.ts`): Central file that registers all API routes with middleware. Uses `registerRoutes(app)` pattern.

3. **Middleware Stack** (applied in order):
   - Security headers (CORS, CSRF, helmet-like protection)
   - Express sessions (MemoryStore-backed in current implementation)
   - Request logging & performance monitoring
   - Memory monitoring
   - Request timeout (30s default)
   - Input sanitization
   - Response helpers (adds `.success()`, `.created()`, `.updated()`, `.deleted()`, `.notFound()`, `.badRequest()`, `.unauthorized()`, etc.)
   - CSRF token generation

4. **Authentication** (`server/middleware/authentication.ts`):
   - Session-based auth with MemoryStore (in-memory session storage)
   - `requireAuth` middleware for protected routes (disabled in dev/test mode)
   - `requireUserAccess` validates userId parameter matches session
   - Password hashing with bcrypt, automatic rehashing for security updates

5. **Error Handling** (`server/middleware/errorHandler.ts`):
   - `asyncHandler`: Wraps async route handlers, catches errors
   - `AppError`: Custom error class with status codes
   - `withRetry`: Retry wrapper for database operations
   - Global error handler converts errors to JSON responses

6. **Validation** (`server/middleware/validation.ts` + `server/validation/schemas.ts`):
   - Zod schemas for request validation
   - Separate schemas for path params, query params, create/update bodies
   - File upload validation for CAMT.053 XML imports

### Services Layer

**Core Services:**
- **`CamtParser`** (`server/services/camtParser.ts`): Parses CAMT.053 XML bank statements using xml2js
- **`TransactionCategorizer`** (`server/services/categorization.ts`): Auto-categorizes transactions based on merchant, description patterns
- **`FireCalculator`** (`server/services/fireCalculations.ts`): Calculates FIRE metrics with 6-month rolling averages
- **`InternalTransferDetector`** (`server/services/internalTransferDetector.ts`): Detects transfers between user's own accounts using IBAN matching, amount/date proximity
- **`duplicateDetectionService`** (`server/services/duplicateDetection.ts`): SHA-256 hashing to prevent duplicate transaction imports
- **`IntelligentTransferOptimizer`** (`server/services/intelligentTransferOptimizer.ts`): Generates transfer recommendations based on goals, spending patterns
- **`UnifiedTransferRecommendationEngine`** (`server/services/unifiedTransferRecommendationEngine.ts`): Main engine for transfer suggestions

**Service Pattern:**
- Services are stateless, instantiated per request or as singletons
- Services receive data from storage layer, return processed results
- No direct database access in services - always use `storage` interface

### Frontend Architecture

**Routing:** Wouter (lightweight React Router alternative)

**State Management:**
- TanStack Query for server state (caching, refetching, optimistic updates)
- React Context for global UI state (minimal usage)
- Local component state for UI interactions

**API Layer:** `client/src/lib/api.ts` - Centralized API client with typed endpoints

**Component Organization:**
- **`pages/`** - Top-level route components (lazy-loaded)
- **`components/`** - Reusable UI components
- **`components/ui/`** - Radix UI + Shadcn components (base design system)
- **`hooks/`** - Custom React hooks
- **`lib/`** - Utilities, API client, query client config

**Key Frontend Patterns:**
1. Lazy loading for all page components via `React.lazy()`
2. Suspense boundaries with loading spinners
3. Error boundaries for route-level error handling
4. TanStack Query hooks for data fetching with automatic caching
5. Form validation with Zod schemas

### Database Schema (Drizzle ORM)

**Schema Definition:** `shared/schema.ts` - Single source of truth for database structure

**Key Tables:**
- `users` - User accounts (username, hashed password)
- `accounts` - Bank accounts (IBAN, balance, role, type)
- `transactions` - Bank transactions with internal transfer detection fields
- `categories` - Transaction categories (essential, discretionary, income, transfer)
- `goals` - Financial goals with target/current amounts
- `transfer_recommendations` - AI-generated transfer suggestions
- `transfer_preferences` - User-defined transfer rules
- `budget_periods` - Zero-based budgeting periods
- `budget_categories` - Category allocations per budget period
- `budget_accounts` - Account roles in budget (income/spending/savings)
- `import_history` - Track file imports with duplicate detection
- `import_batches` - Group imports for rollback capability
- `transaction_hashes` - SHA-256 hashes for duplicate detection
- `crypto_wallets` - Cryptocurrency wallet tracking

**Schema Patterns:**
- Foreign keys are integers, not enforced at DB level (application-level enforcement)
- Decimal columns for money (precision: 12, scale: 2)
- Timestamps use PostgreSQL `timestamp` type
- Indexes on frequently queried columns (counterpartyIban, date, amount)

**Migration Workflow:**
1. Modify `shared/schema.ts`
2. Run `npm run db:generate` to create migration
3. Review generated SQL in `migrations/`
4. Run `npm run db:push` (dev) or `npm run db:migrate` (prod)

### Testing Architecture

**Test Setup:** `test/setup.ts` - Global test configuration

**Database Testing:**
- Tests use dedicated PostgreSQL test database (managed by `./run-tests.sh`)
- Tests can run with or without database (graceful fallback to mocks)
- Helper function `itIfDb` skips DB-dependent tests when database unavailable
- Test pool manager handles connection pooling with recovery system
- Automatic schema setup and data cleanup between test runs

**Test Categories:**
- Unit tests: `test/**/*.test.ts`
- Integration tests: `test/integration/**/*.test.ts`
- E2E tests: Playwright configuration in `playwright.config.ts`
- Performance tests: `test/performance/**/*.test.ts`
- Security tests: `test/security/**/*.test.ts`

**CI Configuration:**
- Vitest configured with CI-specific settings (timeouts, retries, parallelization)
- Environment variable `CI=true` enables CI mode
- Uses thread pool for parallel test execution in CI
- Coverage thresholds: 75% (CI) / 80% (local)

### Internal Transfer Detection

**Algorithm** (`server/services/internalTransferDetector.ts`):
1. Group user's accounts by IBAN
2. For each transaction, find potential matches:
   - Opposite sign (debit/credit pair)
   - Same absolute amount (or amount minus small fee)
   - Date within ±3 days
   - Counterparty IBAN matches one of user's accounts
3. Confidence scoring:
   - **High**: Exact amount + same day + IBAN match + reference match
   - **Medium**: Exact amount + date ±1 day + IBAN match
   - **Low**: Amount match (with fee) + date ±3 days
4. Update both transactions with `isInternalTransfer`, `matchedTransferId`, `transferDetectionConfidence`

**Running Detection:**
```bash
# Via script (for existing data)
DATABASE_URL=postgresql://user:pass@host:5433/db tsx server/scripts/detectInternalTransfers.ts

# Via API endpoint (for new imports)
POST /api/transfers/detect/:userId
```

### FIRE Calculations

**Metrics** (`server/services/fireCalculations.ts`):
- Uses 6-month rolling average for income/expenses
- Formula: `FIRE Number = 25 × Annual Expenses` (4% rule)
- Progress: `Current Savings / FIRE Number`
- Volatility analysis: Coefficient of variation for income stability
- Emergency buffer recommendations based on income volatility

**Monthly Breakdown:**
- Groups transactions by month (YYYY-MM)
- Separates income (positive amounts) from expenses (negative amounts)
- Returns array of monthly data for charts and analysis

## Important Implementation Details

### CSRF Protection
- CSRF token generated per session via middleware
- Token stored in session, sent to client on authenticated requests
- Frontend must include token in POST/PUT/PATCH/DELETE requests
- Token validation happens in authentication middleware

### Session Management
- Sessions stored in memory using `memorystore` (MemoryStore)
- Session cookie: `vonkfi.session` (httpOnly, secure in production, sameSite: 'strict')
- Session duration: 24 hours (configurable via `sessionConfig`)
- Session cleanup: Automatic pruning every 24 hours via MemoryStore
- Note: For production with multiple instances, consider migrating to connect-pg-simple or Redis store

### File Upload Flow
1. Client uploads CAMT.053 XML via `POST /api/import/:userId`
2. Multer middleware stores file in memory
3. `CamtParser` parses XML into transaction objects
4. Duplicate detection via SHA-256 hashing
5. Account auto-discovery (creates accounts for new IBANs)
6. Batch insert transactions with import tracking
7. Internal transfer detection runs automatically
8. Response includes import summary (new transactions, duplicates, accounts)

### Performance Optimizations
- **Dashboard Query:** Single optimized query joins accounts, transactions, categories, goals (reduced from 5+ queries)
- **Lazy Loading:** All frontend routes code-split with React.lazy
- **Query Performance Monitor:** Dev-mode logging for slow queries (>100ms)
- **Database Indexes:** On transaction date, amount, counterpartyIban
- **Connection Pooling:** pg.Pool with configurable min/max connections

### Security Measures
- Password hashing: bcrypt with configurable rounds (default: 10)
- Automatic password rehashing when security standards updated
- Rate limiting middleware (configured per route)
- Input sanitization (XSS protection)
- SQL injection prevention via Drizzle ORM parameterized queries
- Session fixation prevention
- Secure headers (X-Frame-Options, X-Content-Type-Options, etc.)

## Environment Variables

Required for development:
```
DATABASE_URL=postgresql://user:password@localhost:5432/vonkfi_dev
NODE_ENV=development
PORT=5000
```

For testing:
```
DATABASE_URL=postgresql://test:test@localhost:5432/vonkfi_test
NODE_ENV=test
TEST_MODE=true
DISABLE_AUTH_FOR_TESTS=true
```

## Common Development Tasks

### Adding a New API Endpoint
1. Define Zod schema in `server/validation/schemas.ts`
2. Add route handler in `server/routes.ts` with middleware stack
3. Add storage method to `IStorage` interface and `DatabaseStorage` class in `server/storage.ts`
4. Add API method to `client/src/lib/api.ts`
5. Create/update TanStack Query hook if needed
6. Write tests in `test/`

### Adding a New Database Table
1. Add table schema to `shared/schema.ts` using Drizzle table helpers
2. Export insert/select types using `createInsertSchema` from `drizzle-zod`
3. Run `npm run db:generate` to create migration
4. Review migration SQL, run `npm run db:push`
5. Add storage methods to `server/storage.ts`
6. Update TypeScript types if needed

### Adding a New Service
1. Create service class in `server/services/`
2. Make service stateless or singleton (prefer stateless)
3. Accept data via constructor or method parameters (use storage interface)
4. Return processed data (no side effects like DB writes in service logic)
5. Integrate service in route handlers via `server/routes.ts`
6. Write unit tests for service logic

### Debugging Transfer Detection Issues
1. Check transaction data: `SELECT * FROM transactions WHERE user_id = X ORDER BY date DESC LIMIT 50`
2. Look for counterparty IBANs: `SELECT DISTINCT counterparty_iban FROM transactions WHERE account_id IN (user's accounts)`
3. Run detection script with logging: Check `server/scripts/detectInternalTransfers.ts`
4. Verify confidence scoring logic in `server/services/internalTransferDetector.ts`
5. Test with known transfer pairs manually

### Working with Test Database
```bash
# Start test database with Docker
./run-tests.sh

# Or manually with Docker Compose
docker-compose -f docker-compose.test.yml up -d

# Connect to test database
psql postgresql://test:test@localhost:5432/vonkfi_test

# Clean test data (run from project root)
npm run test:run test/setup.ts
```

## Code Style & Conventions

- **TypeScript**: Strict mode enabled, no implicit any
- **Async/Await**: Preferred over promises/callbacks
- **Error Handling**: Always wrap async route handlers with `asyncHandler`
- **Imports**: Use absolute imports with `@/` (client) and `@shared/` (shared)
- **Database Queries**: Always use Drizzle ORM, no raw SQL unless necessary
- **API Responses**: Use response helpers from middleware: `res.success()`, `res.created()`, `res.updated()`, `res.deleted()`, `res.notFound()`, `res.badRequest()`, `res.unauthorized()`, etc.
- **Validation**: Zod schemas for all inputs (params, query, body, files)
- **Testing**: Use `describe`/`it` for structure, `itIfDb` for DB tests

## Known Issues & Workarounds

### Migration Race Conditions in Tests
The test setup handles migration race conditions with advisory locks. If you see "relation already exists" errors, the test setup will recover gracefully.

### Transfer Detection Confidence
Transfer detection may have false positives for:
- Recurring payments with same amounts
- Refunds that match original transaction amounts
Always verify high-confidence matches before marking as internal transfers.

### Session Store Limitations
The current implementation uses MemoryStore for sessions, which:
- Loses all sessions on server restart
- Doesn't scale across multiple server instances
- Auto-prunes expired sessions every 24 hours

For production with multiple instances, migrate to connect-pg-simple or Redis-based session store.