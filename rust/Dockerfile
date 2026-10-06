# Multi-stage build of the Rust server. Build context: this `rust/` directory.
ARG RUST_VERSION=1.97
ARG DEBIAN_RELEASE=trixie

# 1) Builder: compile the release binaries
FROM rust:${RUST_VERSION}-${DEBIAN_RELEASE} AS builder
WORKDIR /build

# Compile the dependencies first, against stub sources, so source-only
# changes reuse this layer
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src/bin && \
  touch src/lib.rs && \
  for bin in frisbee-server gameday-export migrate-mongo; do \
    echo 'fn main() {}' > "src/bin/$bin.rs"; \
  done && \
  cargo build --release --locked --bins && \
  rm -rf src

COPY src ./src
# make sure cargo sees the real sources as newer than the stub build
RUN find src -name '*.rs' -exec touch {} + && \
  cargo build --release --locked --bins && \
  mkdir -p /out && \
  cp target/release/frisbee-server target/release/gameday-export \
    target/release/migrate-mongo /out/

# 2) Runtime: the binaries plus a system Chromium (and fonts) for GameDay exports
FROM debian:${DEBIAN_RELEASE}-slim AS runner

# tini reaps the Chromium processes the exporter leaves behind and forwards
# SIGTERM so the server can drain
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-freefont-ttf \
    fonts-liberation \
    tini && \
  rm -rf /var/lib/apt/lists/*

# SQLITE_PATH lives on a persistent volume mounted at /data (on Railway, a
# service volume at /data; Railway rejects the VOLUME instruction, so none is
# declared here). The exporter binary and Chromium are found through the
# GAMEDAY_* variables.
ENV NODE_ENV=production \
  PORT=8080 \
  SQLITE_PATH=/data/frisbee.sqlite \
  GAMEDAY_EXPORT_BIN=/app/gameday-export \
  GAMEDAY_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY --from=builder /out/ /app/
RUN mkdir -p /data

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/frisbee-server"]
