#!/bin/bash

# Exit on error
set -e

# Function to clean up on exit
cleanup() {
  echo "Cleaning up..."
  docker-compose -f docker-compose.test.yml down
}

# Register the cleanup function to be called on exit
trap cleanup EXIT

# Print header
echo "==================================================="
echo "Running VonkFi tests with test database"
echo "==================================================="

# Start the test database
echo "Starting test database..."
docker-compose -f docker-compose.test.yml up -d

# Wait for the database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Check if database is ready
echo "Checking database connection..."
max_attempts=10
attempt=1
while [ $attempt -le $max_attempts ]; do
  if docker-compose -f docker-compose.test.yml exec postgres-test pg_isready -U test -d vonkfi_test; then
    echo "Database is ready!"
    break
  fi
  echo "Attempt $attempt of $max_attempts: Database not ready yet, waiting..."
  sleep 3
  attempt=$((attempt+1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "Warning: Database might not be ready after $max_attempts attempts, but continuing anyway..."
fi

# Load test environment variables
echo "Loading test environment variables..."
while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip empty lines and comments
  if [[ -z "$line" || "$line" =~ ^# ]]; then
    continue
  fi
  export "$line"
done < .env.test

# Run the tests
echo "Running tests..."
if [ $# -eq 0 ]; then
  # No arguments provided, run all tests
  npm test
else
  # Arguments provided, run specific tests
  if [ $# -eq 1 ]; then
    # Single argument - test file
    echo "Running tests in file: $1"
    npx vitest run "$1"
  elif [ $# -eq 2 ]; then
    # Two arguments - test file and test name
    echo "Running test '$2' in file: $1"
    npx vitest run "$1" -t "$2"
  else
    echo "Usage: $0 [test_file] [test_name]"
    exit 1
  fi
fi

# Print footer
echo "==================================================="
echo "Tests completed"
echo "==================================================="
