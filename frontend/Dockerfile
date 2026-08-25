# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22-slim AS builder
WORKDIR /app
# pnpm via corepack (bundled with Node). This project uses pnpm, never npm.
RUN corepack enable

# Install deps first so Docker caches this layer. The pnpm lockfile makes the
# install reproducible (--frozen-lockfile fails if it's out of sync).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# IMPORTANT: NEXT_PUBLIC_* variables are baked into the JS bundle at BUILD time,
# not read at runtime. The compose file passes this as a build arg so the browser
# knows where the backend lives. If it's wrong here, the app will call the wrong URL.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm build

# ---- Runtime stage: minimal standalone server ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Bind to all interfaces so the container is reachable from the proxy
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` (see next.config.ts) bundles the server + only the
# node_modules it actually needs, so the runtime image needs no package manager.
# static/ and public/ must be copied separately.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Drop root: run the server as the unprivileged 'node' user baked into the image.
USER node

EXPOSE 3000
CMD ["node", "server.js"]
