# ─────────────────────────────────────────────────────────
# prime-frontend — React + Vite build
#
# Stage 1: build the SPA
# Stage 2: serve with nginx
#
# No application code exists yet (Phase 6+).
# This Dockerfile is the target for when frontend code is added
# under apps/frontend/src/.
# ─────────────────────────────────────────────────────────

# Stage 1 — Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --frozen-lockfile

# Copy source and build
COPY . .
RUN npm run build
# Output lands in /app/dist

# Stage 2 — Serve
FROM nginx:1.27-alpine AS runner
WORKDIR /usr/share/nginx/html

# Remove default nginx content
RUN rm -rf ./*

# Copy built SPA
COPY --from=builder /app/dist .

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
