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

# package.json's postinstall runs `prisma generate`, which needs the schema
# file present at npm-ci time — copy it alongside package*.json before
# installing (including devDependencies for tsc).
COPY package*.json ./
COPY prisma ./prisma
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

# Copy production dependencies only. Schema copied first so postinstall's
# `prisma generate` can produce the runtime client this stage needs.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --frozen-lockfile --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Own the app files as the non-root user
RUN chown -R prime:prime /app

USER prime

EXPOSE 3000

# Healthcheck — calls the /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/server.js"]
