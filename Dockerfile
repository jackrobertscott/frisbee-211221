FROM node:20-alpine

# Install shared dependencies
WORKDIR /app/shared
COPY /shared/package.json .
RUN npm install

# Install server dependencies
WORKDIR /app/server
COPY /server/package.json .
RUN npm install

# Copy app files after installing dependencies
COPY /shared /app/shared
COPY /server /app/server

# Build server (cbf getting build to work.. using tsx instead)
# RUN npm run build
EXPOSE 8080
CMD ["npm", "run", "start"]
