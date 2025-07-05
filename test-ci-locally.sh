#!/bin/bash

echo "🚀 Testing CI pipeline locally..."

# Set environment variables
export DATABASE_URL="postgresql://test:test@localhost:5432/vonkfi_test"
export CI=true
export NODE_ENV=test

echo "📋 Environment:"
echo "  DATABASE_URL: $DATABASE_URL"
echo "  CI: $CI"
echo "  NODE_ENV: $NODE_ENV"

# Start services with Docker Compose
echo "🐳 Starting test database..."
docker-compose -f docker-compose.test.yml up -d postgres redis

# Wait for database
echo "⏳ Waiting for database to be ready..."
timeout 60s bash -c 'until docker-compose -f docker-compose.test.yml exec postgres pg_isready -U test -d vonkfi_test; do sleep 2; done'

if [ $? -eq 0 ]; then
    echo "✅ Database is ready"
else
    echo "❌ Database failed to start"
    exit 1
fi

# Test migration steps
echo "🔄 Testing migration steps..."

echo "1. Testing database migrations..."
npm run db:migrate

echo "2. Testing rollback script..."
npm run test:migrations:rollback

echo "3. Testing migration tests..."
npm run test:migrations

# Cleanup
echo "🧹 Cleaning up..."
docker-compose -f docker-compose.test.yml down

echo "✅ Local CI test completed!"