FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    # node canvas dependencies
    build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev \
    # puppeteer dependencies
    chromium ca-certificates \
    # healthcheck dependencies
    curl

# Set puppeteer configs
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install shared dependencies
WORKDIR /app/shared
COPY /packages/shared/package.json .
RUN npm install

# Install server dependencies
WORKDIR /app/server
COPY /packages/server/package.json .
RUN npm install

# Copy app files after installing dependencies
COPY /packages/shared /app/shared
COPY /packages/server /app/server

# Build server (cbf getting build to work.. using tsx instead)
# RUN npm run build
EXPOSE 8080
CMD ["npm", "run", "start"]
