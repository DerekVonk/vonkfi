# Multi-stage build for VonkFi application
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Development dependencies for building
FROM base AS build-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build the application
FROM build-deps AS builder
WORKDIR /app
COPY . .

# Build frontend and backend
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 vonkfi

# Copy built application
COPY --from=builder --chown=vonkfi:nodejs /app/dist ./dist
COPY --from=builder --chown=vonkfi:nodejs /app/package*.json ./
COPY --from=deps --chown=vonkfi:nodejs /app/node_modules ./node_modules

# Copy database setup files
COPY --chown=vonkfi:nodejs database-setup.sql ./
COPY --chown=vonkfi:nodejs drizzle.config.ts ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Switch to non-root user
USER vonkfi

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]