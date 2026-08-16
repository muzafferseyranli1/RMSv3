# SuitableRMS Production Web Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package*.json ./

# Install dependencies (ignoring optional desktop/native modules)
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Build production Vite bundle
ENV NODE_ENV=production
RUN npm run build

# Production Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install lightweight static file server with SPA support
RUN npm install -g serve

# Copy built distribution files from builder
COPY --from=builder /app/dist /app/dist

# Expose web port (Coolify defaults to 3000)
ENV PORT=3000
EXPOSE 3000

# Run static web server with SPA rewrite (-s) on port 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
