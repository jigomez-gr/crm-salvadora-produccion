# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# 1. Build Backend (NestJS)
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS backend-builder
WORKDIR /app/backend
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/ ./
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# 2. Build Frontend (Next.js)
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# 3. Final Production Runner Stage (Dokploy Application)
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Install Backend production dependencies
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=backend-builder /app/backend/dist ./dist

# Copy Frontend standalone build
WORKDIR /app/frontend
COPY --from=frontend-builder /app/frontend/.next/standalone ./
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /app/frontend/public ./public

# Root runner script
WORKDIR /app
COPY start.js ./

EXPOSE 3000
EXPOSE 3001

CMD ["node", "start.js"]
