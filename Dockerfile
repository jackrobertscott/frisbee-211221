## Multi-stage build to minimize final image size

# 1) Builder: install dev tooling (esbuild) and bundle TS -> JS
FROM node:20-alpine AS builder
WORKDIR /app

# esbuild on Alpine needs glibc compatibility
RUN apk add --no-cache libc6-compat

# Install server deps (including dev for build)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Copy sources needed for bundling
COPY server ./server
COPY shared ./shared

# Bundle server entry. Externalize package imports; include local shared code.
RUN cd server && \
  ./node_modules/.bin/esbuild src/index.ts \
    --bundle --platform=node --target=node20 --format=esm \
    --outdir=dist --tsconfig=tsconfig.json --packages=external --minify

# 2) Runtime: only production deps + built output
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app/server

# Install only prod dependencies using lockfile
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && \
    npm i --omit=dev --no-audit --no-fund --no-save torva@^0.4.0

# Copy dotenv-safe example for env validation
COPY server/.env.example ./

# Copy built JS from builder
COPY --from=builder /app/server/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
