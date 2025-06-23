# VonkFi Database Management

This directory contains database-related files and documentation for the VonkFi personal finance application.

## Overview

VonkFi uses **PostgreSQL** as its primary database with **Drizzle ORM** for schema management and type-safe database operations.

## Database Schema Management

### Primary System: Drizzle ORM Migrations

The **authoritative** database schema is managed through Drizzle ORM:

- **Schema Definition**: `shared/schema.ts` - TypeScript schema definitions
- **Migration Files**: `migrations/` - Auto-generated SQL migrations
- **Configuration**: `drizzle.config.ts` - Drizzle configuration

#### Migration Workflow

```bash
# Generate new migration after schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate

# View current migration status
npm run db:studio
```

**Important**: The `migrations/` directory files are auto-generated and **should not be edited manually**.

## Directory Structure

```
database/
├── README.md                    # This documentation
├── manual-scripts/              # Legacy/manual setup scripts
│   └── database-setup.sql      # Manual database initialization
└── performance/                 # Performance optimization
    └── database-performance-indexes.sql  # Additional indexes
```

## Setting Up Database From Scratch

### Option 1: Using Drizzle Migrations (Recommended)

1. Create a PostgreSQL database
2. Set `DATABASE_URL` environment variable
3. Run migrations:
   ```bash
   npm run db:migrate
   ```
4. Optionally apply performance indexes:
   ```bash
   psql $DATABASE_URL -f database/performance/database-performance-indexes.sql
   ```

### Option 2: Manual Setup (Legacy)

For development or troubleshooting only:
```bash
psql $DATABASE_URL -f database/manual-scripts/database-setup.sql
```

**⚠️ Warning**: The manual setup script may have schema differences from the current Drizzle migrations.

## Schema Consistency

The database schema is defined in multiple places for different purposes:

1. **`shared/schema.ts`** - Authoritative TypeScript definitions (used by Drizzle)
2. **`migrations/*.sql`** - Generated SQL migrations (auto-generated from schema.ts)
3. **`database/manual-scripts/database-setup.sql`** - Legacy manual setup (may be outdated)

### Known Schema Differences

The manual setup script and Drizzle migrations may have some differences:

- **transaction_hashes table**: Different column names (`transaction_hash` vs `hash`)
- **budget_accounts table**: Different column structure
- **Some table constraints**: May vary between versions

**Always use the Drizzle migrations for production deployments.**

## Performance Optimization

The `database/performance/database-performance-indexes.sql` file contains optimized indexes for:

- Query performance on large transaction datasets
- Dashboard and analytics queries
- Import and duplicate detection operations

Apply these indexes after initial setup:
```bash
psql $DATABASE_URL -f database/performance/database-performance-indexes.sql
```

## Database Utilities

Database utility scripts are located in `scripts/db-utils/`:

- `check-db.js` - Connection testing and schema inspection
- `test-hash-schema.js` - Schema validation for duplicate detection
- `test-transaction-hash.js` - Transaction hash functionality testing

## Environment Variables

Required environment variables:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/vonkfi
```

## Troubleshooting

### Migration Issues

```bash
# Reset migrations (DESTRUCTIVE)
npm run db:drop
npm run db:migrate

# View current schema
npm run db:studio
```

### Schema Validation

Use the database utility scripts to validate schema consistency:

```bash
node scripts/db-utils/check-db.js
node scripts/db-utils/test-hash-schema.js
```

## Production Deployment

1. Backup existing database
2. Run `npm run db:migrate` to apply new migrations
3. Apply performance indexes if needed
4. Test with `scripts/db-utils/check-db.js`

---

**Note**: Always backup your database before applying migrations or schema changes.