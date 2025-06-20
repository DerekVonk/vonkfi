#!/bin/bash

# VonkFi Setup Script
# This script automates the deployment of VonkFi on your server

set -e

echo "🚀 VonkFi Setup Script"
echo "====================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if PostgreSQL is available
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL client not found. Make sure you have access to a PostgreSQL database."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment configuration..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your database credentials before proceeding."
    echo "   Example: DATABASE_URL=postgresql://username:password@host:port/database"
    read -p "Press Enter after you've configured the .env file..."
fi

# Source environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set in .env file"
    exit 1
fi

echo "✅ Environment variables loaded"

# Test database connection
echo "🔍 Testing database connection..."
if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
        echo "✅ Database connection successful"
    else
        echo "❌ Database connection failed. Please check your DATABASE_URL"
        exit 1
    fi
else
    echo "⚠️  Cannot test database connection (psql not available)"
fi

# Run database setup
echo "🗄️  Setting up database schema..."
if command -v psql &> /dev/null; then
    psql "$DATABASE_URL" -f database-setup.sql
    echo "✅ Database schema created successfully"
else
    echo "⚠️  Please run the database setup manually:"
    echo "   psql \"$DATABASE_URL\" -f database-setup.sql"
fi

# Build the application
echo "🔨 Building application..."
npm run build
echo "✅ Application built successfully"

# Create systemd service file (optional)
read -p "Create systemd service for auto-start? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_FILE="/etc/systemd/system/vonkfi.service"
    CURRENT_DIR=$(pwd)
    
    sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=VonkFi Personal Finance Management
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/node $CURRENT_DIR/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable vonkfi
    echo "✅ Systemd service created and enabled"
fi

echo ""
echo "🎉 VonkFi setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the application:"
echo "   npm start"
echo ""
echo "2. Or if you created a systemd service:"
echo "   sudo systemctl start vonkfi"
echo ""
echo "3. Access VonkFi at: http://your-server-ip:${PORT:-5000}"
echo ""
echo "4. Default login (change in production):"
echo "   Username: demo"
echo "   Password: demo123"
echo ""
echo "For production deployment, see DEPLOYMENT.md for additional configuration."