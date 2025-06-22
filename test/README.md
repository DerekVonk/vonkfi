# VonkFi Test Suite

This directory contains the test suite for the VonkFi application.

## Running Tests

### Option 1: Run tests with a test database (recommended)

The test suite is designed to work with a test database. This ensures that all tests, including database-dependent tests, can run successfully.

1. Make sure you have Docker and Docker Compose installed.

2. Run the tests using the provided script:

```bash
# Make the script executable
chmod +x ./run-tests.sh

# Run the tests
./run-tests.sh
```

This script will:
- Start a PostgreSQL test database using Docker Compose
- Run the test suite
- Clean up the database when done

### Option 2: Run tests without a database

If you don't have Docker installed or prefer to run tests without a database, you can still run the tests:

```bash
npm test
```

Note that database-dependent tests will be skipped in this case. You'll see messages like:

```
Skipping database test - no test database available
```

## Test Database Configuration

The test database is configured in `docker-compose.test.yml` and uses the following settings:

- Database: `vonkfi_test`
- Username: `test`
- Password: `test`
- Port: `5434` (to avoid conflicts with development and production databases)

If you need to connect to the test database manually:

```bash
# Start the test database
docker-compose -f docker-compose.test.yml up -d

# Connect to the database
psql -h localhost -p 5434 -U test -d vonkfi_test
# Password: test

# Stop the test database when done
docker-compose -f docker-compose.test.yml down
```

## Test Structure

The tests are organized by feature area:

- `auth-security.test.ts`: Authentication and security tests
- `business-logic.test.ts`: Business logic and calculation tests
- `error-handling.test.ts`: Error handling and edge case tests
- And more...

## Adding New Tests

When adding new tests that require database access, make sure to check for the `shouldSkipDbTests` flag:

```typescript
if (shouldSkipDbTests) {
  console.log('Skipping database test - no test database available');
  return;
}
```

This ensures that your tests can run in environments without a database connection.