## Multi-stage build to minimize final image size
ARG NODE_VERSION=24
ARG ESBUILD_TARGET=node24

# 1) Builder: install dev tooling (esbuild) and bundle TS -> JS
FROM node:${NODE_VERSION}-alpine AS builder
ARG ESBUILD_TARGET
WORKDIR /app

# esbuild on Alpine needs glibc compatibility
RUN apk add --no-cache libc6-compat

# Install server deps (including dev deps for the build)
COPY server/package*.json ./server/
RUN cd server && \
  if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  else \
    npm install --no-audit --no-fund; \
  fi

# Copy sources needed for bundling
COPY server ./server
COPY shared ./shared

# Bundle server entry. Externalize package imports; include local shared code.
RUN cd server && \
  ./node_modules/.bin/esbuild src/index.ts src/gameday/exportCli.ts \
    --bundle --platform=node --target=${ESBUILD_TARGET} --format=esm \
    --outdir=dist --tsconfig=tsconfig.json --packages=external --minify

# 2) Runtime: only production deps + built output
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app/server

# Install only prod dependencies and a system Chromium for GameDay exports
RUN apk add --no-cache chromium ca-certificates nss freetype harfbuzz ttf-freefont
COPY server/package*.json ./
RUN if [ -f package-lock.json ]; then \
    npm ci --omit=dev --no-audit --no-fund; \
  else \
    npm install --omit=dev --no-audit --no-fund; \
  fi

# Copy built JS from builder
COPY --from=builder /app/server/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
