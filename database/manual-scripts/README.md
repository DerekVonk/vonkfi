# Manual Database Scripts

⚠️ **Legacy Scripts - Use with Caution**

These scripts are provided for development, troubleshooting, or emergency database setup purposes only.

## Files

### `database-setup.sql`
- **Purpose**: Complete database initialization from scratch
- **Status**: Legacy - may have schema differences from current Drizzle migrations
- **Usage**: Development/testing environments only

```bash
psql $DATABASE_URL -f database/manual-scripts/database-setup.sql
```

## ⚠️ Important Warnings

1. **Schema Inconsistencies**: These scripts may not match the current Drizzle schema
2. **Production Risk**: Do not use in production - use Drizzle migrations instead
3. **Data Loss**: These scripts will drop existing data

## Recommended Approach

For all deployments, use the official Drizzle migration system:

```bash
npm run db:migrate
```

## When to Use Manual Scripts

- Emergency database recovery
- Development environment quick setup
- Schema debugging and comparison
- Historical reference

## Schema Differences

Known differences between manual scripts and Drizzle migrations:

- Column naming conventions
- Constraint definitions
- Index implementations
- Default values

Always verify schema consistency using:
```bash
node scripts/db-utils/check-db.js
```