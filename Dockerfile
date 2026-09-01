# ==========================================
# Dockerfile for Node.js Sample Management
# ==========================================

FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including build tools
RUN npm ci

# Copy application source code
COPY . .

# Build step / prepare directories
RUN mkdir -p data uploads

# ==========================================
# Final Production Runtime Stage
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime libs if needed
RUN apk add --no-cache tzdata
ENV TZ=Asia/Jakarta

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy built application and node_modules from builder
COPY --from=builder /app /app

# Expose HTTP port
EXPOSE 3000

# Volume mount point for SQLite database persistence
VOLUME ["/app/data", "/app/uploads"]

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/stats/dashboard || exit 1

# Start the application
CMD ["npm", "start"]
