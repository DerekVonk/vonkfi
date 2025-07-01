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
sleep 5

# Check if database is ready with exponential backoff
echo "Checking database connection..."
max_attempts=10
attempt=1
base_delay=1
max_delay=16

while [ $attempt -le $max_attempts ]; do
  # Check if container is running first
  if ! docker-compose -f docker-compose.test.yml ps postgres-test | grep -q "Up"; then
    echo "Attempt $attempt of $max_attempts: Container not running yet, waiting..."
  # Then check if database is ready
  elif docker-compose -f docker-compose.test.yml exec postgres-test pg_isready -U test -d vonkfi_test >/dev/null 2>&1; then
    echo "Database is ready!"
    
    # Additional connectivity test
    if docker-compose -f docker-compose.test.yml exec postgres-test psql -U test -d vonkfi_test -c "SELECT 1;" >/dev/null 2>&1; then
      echo "Database connectivity verified!"
      break
    else
      echo "Database ready but connectivity failed, retrying..."
    fi
  else
    echo "Attempt $attempt of $max_attempts: Database not ready yet, waiting..."
  fi
  
  # Calculate exponential backoff delay (capped at max_delay)
  delay=$((base_delay * (1 << (attempt - 1))))
  if [ $delay -gt $max_delay ]; then
    delay=$max_delay
  fi
  
  echo "Waiting ${delay} seconds before next attempt..."
  sleep $delay
  attempt=$((attempt+1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "Error: Database failed to become ready after $max_attempts attempts!"
  echo "Container status:"
  docker-compose -f docker-compose.test.yml ps
  echo "Container logs:"
  docker-compose -f docker-compose.test.yml logs postgres-test --tail=20
  exit 1
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

# Run smoke tests first to validate infrastructure
echo "Running infrastructure smoke tests..."
if ! npx vitest run test/smoke-tests.ts --reporter=verbose; then
  echo "❌ Smoke tests failed! Infrastructure is not ready for testing."
  echo "Container status:"
  docker-compose -f docker-compose.test.yml ps
  echo "Container logs:"
  docker-compose -f docker-compose.test.yml logs postgres-test --tail=50
  exit 1
fi

echo "✅ Smoke tests passed! Infrastructure is ready."
echo ""

# Run the main tests
echo "Running main test suite..."
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

# Print footer with summary
echo "==================================================="
echo "Tests completed successfully"
echo "Container cleanup will happen automatically on exit"
echo ""
echo "📊 Test Reports Generated:"
echo "  • JSON Report: ./test-results/test-results.json"
echo "  • JUnit XML: ./test-results/test-results.xml"
echo "  • Coverage Report: ./coverage/index.html"
echo ""
echo "💡 To view detailed results:"
echo "  cat ./test-results/test-results.json | jq '.'"
echo "  open ./coverage/index.html"
echo "===================================================="
