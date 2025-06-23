# Scripts Directory

This directory contains utility scripts for development and debugging.

## Database Utils (`db-utils/`)

- `check-db.js` - Database connection and schema inspection utility
- `test-hash-schema.js` - Tests the transaction_hashes schema using Drizzle ORM
- `test-transaction-hash.js` - Tests transaction hash insertion and duplicate detection

## Debug Scripts (`debug/`)

- `debug-import-response.js` - Debug utility for testing CAMT import response structure

## Usage

Run scripts from the project root:

```bash
# Database utilities
node scripts/db-utils/check-db.js
node scripts/db-utils/test-hash-schema.js
node scripts/db-utils/test-transaction-hash.js

# Debug utilities
node scripts/debug/debug-import-response.js
```

**Note:** Ensure environment variables (especially `DATABASE_URL`) are set before running database utilities.