# =============================================================================
# MuzaLife Backend — Dockerfile
#
# Build:   docker build -t muzalife-backend .
# Run:     docker run -p 5001:5001 --env-file .env muzalife-backend
# =============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -S muzalife && adduser -S muzalife -G muzalife

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=muzalife:muzalife . .

# Create uploads directory
RUN mkdir -p uploads/products uploads/profiles && \
    chown -R muzalife:muzalife uploads/

# Switch to non-root user
USER muzalife

EXPOSE 5001

# Use dumb-init to forward signals correctly to Node.js
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- --no-check-certificate https://localhost:5001/api/health || exit 1
