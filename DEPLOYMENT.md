# VonkFi Deployment Guide

This guide will help you deploy VonkFi on your own server with PostgreSQL.

## Prerequisites

- Node.js 18 or higher (20+ recommended)
- PostgreSQL 12 or higher
- Git

## Quick Setup

### 1. Clone the Repository

```bash
git clone <your-vonkfi-repo>
cd VonkFi
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

#### Option A: Using PostgreSQL locally

1. Install PostgreSQL on your server
2. Create a new database:

```sql
CREATE DATABASE vonkfi;
CREATE USER vonkfi_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE vonkfi TO vonkfi_user;
```

3. Run the database setup script:

```bash
psql -U vonkfi_user -d vonkfi -f database-setup.sql
```

#### Option B: Using a managed PostgreSQL service

1. Create a PostgreSQL database on your preferred provider (AWS RDS, DigitalOcean, Heroku, etc.)
2. Get the connection string from your provider
3. Run the setup script using the connection string:

```bash
psql "your_database_connection_string" -f database-setup.sql
```

### 4. Environment Variables

Create a `.env` file in the project root:

```env
# Database Configuration
DATABASE_URL=postgresql://vonkfi_user:your_secure_password@localhost:5432/vonkfi

# Node Environment
NODE_ENV=production

# Server Configuration
PORT=5000
HOST=0.0.0.0

# Security (IMPORTANT: Change these!)
SESSION_SECRET=your_super_secure_session_secret_minimum_32_characters_long
JWT_SECRET=your_jwt_secret_for_authentication_tokens_change_in_production
```

### 5. Build the Application

```bash
npm run build
```

### 6. Start the Application

```bash
npm start
```

The application will be available at `http://your-server-ip:5000`

## Database Schema

VonkFi uses the following main tables:

- **users** - User accounts
- **accounts** - Bank accounts
- **transactions** - Financial transactions
- **categories** - Transaction categories
- **goals** - Financial goals
- **allocations** - Budget allocations
- **budget_periods** - Zero-based budgeting periods
- **transfer_recommendations** - AI-generated transfer suggestions
- **import_history** - File import tracking

## Seeding Initial Data

The setup script automatically creates:

- Default transaction categories (Housing, Food, Transportation, etc.)
- A demo user account (username: `demo`, password: `demo123`)

To create additional users or categories, use the application interface or add them directly to the database.

## Production Considerations

### Security

1. **Change Default Credentials**: Remove or change the demo user credentials
2. **Use Strong Passwords**: Ensure database passwords are secure
3. **Enable SSL**: Configure SSL for database connections in production
4. **Firewall**: Restrict database access to your application server only

### Performance

1. **Connection Pooling**: The application uses connection pooling by default
2. **Indexes**: Database indexes are created automatically for performance
3. **Memory**: Allocate sufficient memory for Node.js (recommended: 1GB+)

### Backup

Set up regular database backups:

```bash
pg_dump -U vonkfi_user vonkfi > backup_$(date +%Y%m%d_%H%M%S).sql
```

## Reverse Proxy Setup (Optional)

For production deployments, consider using nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Process Management

Use PM2 for process management in production:

```bash
npm install -g pm2
pm2 start dist/index.js --name "vonkfi"
pm2 startup
pm2 save
```

## Troubleshooting

### Database Connection Issues

1. Verify PostgreSQL is running
2. Check database credentials and connection string
3. Ensure the database exists and user has proper permissions
4. Check firewall settings if using remote database

### Application Won't Start

1. Check Node.js version (requires 20+)
2. Verify all dependencies are installed
3. Check environment variables are set correctly
4. Review application logs for specific errors

### Import Issues

1. Ensure file upload directory is writable
2. Check file size limits in your deployment environment
3. Verify CAMT.053 XML file format is correct

## Monitoring

Consider setting up monitoring for:

- Application uptime
- Database performance
- Memory usage
- Error rates

Tools like PM2 Monitor, New Relic, or DataDog can help with production monitoring.

## Updates

To update VonkFi:

1. Pull the latest code
2. Run `npm install` to update dependencies
3. Run any new database migrations if provided
4. Rebuild and restart the application

```bash
git pull origin main
npm install
npm run build
pm2 restart vonkfi
```