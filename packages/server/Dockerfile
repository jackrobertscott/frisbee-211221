FROM node:16-alpine AS builder
WORKDIR /app
COPY . .
RUN yarn install --frozen-lockfile
RUN yarn build

FROM node:16-alpine AS final
RUN apk add --no-cache chromium ca-certificates
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.example .
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production
EXPOSE 8080
CMD ["yarn", "start"]
