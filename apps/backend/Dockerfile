# ─────────────────────────────────────────────────────────
# prime-backend — Fastify + TypeScript API
#
# Stage 1: install dependencies and compile TypeScript
# Stage 2: production image (no devDependencies, no source)
#
# No application code exists yet (Phase 6+).
# This Dockerfile is the target for when backend code is added
# under apps/backend/src/.
# ─────────────────────────────────────────────────────────

# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copy source and compile
COPY . .
RUN npm run build
# Output lands in /app/dist

# Stage 2 — Production runner
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user for runtime security
RUN addgroup -S prime && adduser -S prime -G prime

# Copy production dependencies only
COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Own the app files as the non-root user
RUN chown -R prime:prime /app

USER prime

EXPOSE 3000

# Healthcheck — calls the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
