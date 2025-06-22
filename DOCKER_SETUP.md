# VonkFi Docker Setup Guide

This guide will help you set up and run the VonkFi application using Docker and Docker Compose.

## 📋 Prerequisites

- **Docker**: Version 20.10 or later
- **Docker Compose**: Version 2.0 or later
- **Git**: For cloning the repository

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/vonkfi.git
cd vonkfi
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your preferences
nano .env  # or your preferred editor
```

### 3. Start the Application

#### Production Mode
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f vonkfi-app
```

#### Development Mode
```bash
# Start with development overrides
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f vonkfi-app-dev
```

### 4. Access the Application

- **Application**: http://localhost:3000
- **Database Admin (dev only)**: http://localhost:8080 (admin@vonkfi.dev / admin)
- **Redis Admin (dev only)**: http://localhost:8081

## 🔧 Configuration

### Environment Variables

Edit the `.env` file to customize your deployment:

```bash
# Application Settings
NODE_ENV=production
APP_PORT=3000
CORS_ORIGIN=http://localhost:3000

# Database Configuration
POSTGRES_DB=vonkfi
POSTGRES_USER=vonkfi
POSTGRES_PASSWORD=your_secure_password_here

# Security (IMPORTANT: Change these!)
SESSION_SECRET=your_super_secure_session_secret_minimum_32_characters_long
JWT_SECRET=your_jwt_secret_for_authentication_tokens_change_in_production
```

### Important Security Notes

⚠️ **CRITICAL**: Before deploying to production:

1. Change all default passwords in `.env`
2. Use strong, unique secrets for SESSION_SECRET and JWT_SECRET
3. Set appropriate CORS_ORIGIN for your domain
4. Consider enabling SSL/HTTPS (see Nginx configuration)

## 📦 Services Overview

### Core Services

1. **vonkfi-app**: Main application (Node.js + React)
2. **postgres**: PostgreSQL database with automatic initialization
3. **redis**: Redis cache for session storage and performance
4. **nginx**: Reverse proxy with rate limiting (production profile only)

### Development Services

Additional services available in development mode:

1. **pgadmin**: Database administration interface
2. **redis-commander**: Redis management interface

## 🐳 Docker Commands

### Basic Operations

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Restart a service
docker-compose restart vonkfi-app

# Rebuild and start
docker-compose up --build -d
```

### Database Operations

```bash
# Access PostgreSQL directly
docker-compose exec postgres psql -U vonkfi -d vonkfi

# Run database migrations
docker-compose exec vonkfi-app npm run db:push

# Backup database
docker-compose exec postgres pg_dump -U vonkfi vonkfi > backup.sql

# Restore database
docker-compose exec -T postgres psql -U vonkfi vonkfi < backup.sql
```

### Application Management

```bash
# View application logs
docker-compose logs -f vonkfi-app

# Access application shell
docker-compose exec vonkfi-app sh

# Run tests inside container
docker-compose exec vonkfi-app npm test

# Check application health
curl http://localhost:3000/api/health
```

## 🌍 Production Deployment

### 1. Nginx Proxy (Optional)

To enable the Nginx reverse proxy for production:

```bash
# Start with production profile
docker-compose --profile production up -d
```

### 2. SSL Configuration

For HTTPS in production:

1. Obtain SSL certificates (Let's Encrypt recommended)
2. Place certificates in `nginx/ssl/`
3. Uncomment HTTPS server block in `nginx/nginx.conf`
4. Update environment variables accordingly

### 3. External Database

To use an external PostgreSQL database:

```bash
# In .env file
DATABASE_URL=postgresql://user:password@external-host:5432/database

# Disable internal PostgreSQL
docker-compose up -d vonkfi-app redis nginx
```

## 🔍 Monitoring & Troubleshooting

### Health Checks

All services include health checks:

```bash
# Check service health
docker-compose ps

# Application health endpoint
curl http://localhost:3000/api/health
```

### Common Issues

#### 1. Database Connection Failed
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify connection
docker-compose exec vonkfi-app npx drizzle-kit introspect:pg
```

#### 2. Application Won't Start
```bash
# Check application logs
docker-compose logs vonkfi-app

# Verify environment variables
docker-compose exec vonkfi-app env | grep -E "(NODE_ENV|DATABASE_URL)"
```

#### 3. File Upload Issues
```bash
# Check nginx logs (if using)
docker-compose logs nginx

# Verify upload directory permissions
docker-compose exec vonkfi-app ls -la uploads/
```

### Performance Monitoring

```bash
# Monitor resource usage
docker stats

# Check database performance
docker-compose exec postgres psql -U vonkfi -d vonkfi -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

## 🔄 Updates & Maintenance

### Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose up --build -d

# Run any new migrations
docker-compose exec vonkfi-app npm run db:push
```

### Database Maintenance

```bash
# Run VACUUM and ANALYZE
docker-compose exec postgres psql -U vonkfi -d vonkfi -c "VACUUM ANALYZE;"

# Check database size
docker-compose exec postgres psql -U vonkfi -d vonkfi -c "SELECT pg_size_pretty(pg_database_size('vonkfi'));"
```

### Log Rotation

Logs are stored in Docker volumes. To manage log size:

```bash
# Truncate logs (be careful!)
docker-compose logs --tail=1000 vonkfi-app > recent_logs.txt
docker-compose down
docker-compose up -d
```

## 🛟 Backup & Recovery

### Full Backup

```bash
#!/bin/bash
# backup.sh

# Backup database
docker-compose exec postgres pg_dump -U vonkfi vonkfi > "backup_$(date +%Y%m%d_%H%M%S).sql"

# Backup uploaded files
docker run --rm -v vonkfi_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# Backup environment
cp .env "env_backup_$(date +%Y%m%d_%H%M%S)"
```

### Recovery

```bash
#!/bin/bash
# restore.sh

# Restore database
docker-compose exec -T postgres psql -U vonkfi vonkfi < backup_YYYYMMDD_HHMMSS.sql

# Restore uploaded files
docker run --rm -v vonkfi_uploads:/data -v $(pwd):/backup alpine tar xzf /backup/uploads_YYYYMMDD_HHMMSS.tar.gz -C /data

# Restart application
docker-compose restart vonkfi-app
```

## 📊 Performance Optimization

### Database Performance

The setup includes optimized database indexes and configuration:

- Automatic index creation via `database-performance-indexes.sql`
- Query performance monitoring with `pg_stat_statements`
- Optimized PostgreSQL settings for the application workload

### Application Performance

- Multi-stage Docker build for minimal production image
- Nginx with gzip compression and caching
- Redis for session storage and caching
- Health checks and graceful shutdowns

## 🔐 Security Considerations

### Container Security

- Non-root user in application container
- Minimal base images (Alpine Linux)
- No sensitive data in Docker images
- Network isolation between services

### Application Security

- Rate limiting via Nginx
- Input validation and sanitization
- CORS configuration
- Security headers via Nginx

### Database Security

- Isolated database network
- Strong password requirements
- Connection encryption (configure in production)

## 📝 Support

For issues and questions:

1. Check the logs: `docker-compose logs [service-name]`
2. Verify configuration: Check `.env` file and Docker Compose files
3. Review this documentation
4. Check GitHub issues for similar problems

## 🎯 Next Steps

After successful deployment:

1. Import your first CAMT.053 bank statement
2. Set up your financial goals
3. Configure categories and budgets
4. Review transfer recommendations
5. Monitor your FIRE progress!

---

**Happy financial independence tracking with VonkFi! 🔥💰**