# ── Build Stage ──
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ── Production Stage ──
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S botuser && \
    adduser -S botuser -u 1001

# Copy dependency files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

# Copy built files
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Set ownership
RUN chown -R botuser:botuser /app

USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:8443/health || exit 1

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
