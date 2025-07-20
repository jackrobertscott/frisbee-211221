FROM node:20-alpine AS base

# Install only runtime dependencies
RUN apk add --no-cache \
    chromium \
    ca-certificates \
    curl

# Set puppeteer configs
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

FROM base AS dependencies

# Install build dependencies only when needed
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files first for better caching
WORKDIR /app
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json

# Install dependencies (cached layer unless package.json changes)
RUN cd shared && npm ci --only=production
RUN cd server && npm ci --only=production

FROM base AS runtime

# Copy installed dependencies from dependencies stage
COPY --from=dependencies /app/shared/node_modules /app/shared/node_modules
COPY --from=dependencies /app/server/node_modules /app/server/node_modules

# Copy source code
WORKDIR /app
COPY shared/ shared/
COPY server/ server/

EXPOSE 8080
CMD ["npm", "run", "start"]
