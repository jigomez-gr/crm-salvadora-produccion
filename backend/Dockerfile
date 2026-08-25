# syntax=docker/dockerfile:1

# ---- Build stage: compile TypeScript -> dist/ ----
FROM node:22-slim AS builder
WORKDIR /app
# pnpm via corepack (bundled with Node). This project uses pnpm, never npm.
RUN corepack enable

# Install deps first so Docker caches this layer. The pnpm lockfile makes the
# install reproducible (--frozen-lockfile fails if it's out of sync).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Compile the NestJS app
COPY . .
RUN pnpm build

# ---- Runtime stage: small image that only runs the compiled output ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Install ONLY production dependencies, reproducibly from the same lockfile.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Bring in the compiled output from the build stage.
COPY --from=builder /app/dist ./dist

# Drop root: run the app as the unprivileged 'node' user baked into the image.
USER node

# The agent (Mastra) and the API both run inside this single process.
EXPOSE 3001
CMD ["node", "dist/main"]
