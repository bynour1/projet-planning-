# ─── Backend Dockerfile ──────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install deps first (cache layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8083

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8083/api/health || exit 1

CMD ["node", "server.js"]
