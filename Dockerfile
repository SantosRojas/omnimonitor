# =============================================================================
#  omni-pdms-v2 — multi-stage Docker build
#  Target: production server binary (axum REST + WebSocket) + built-in frontend
#  Stages:
#    frontend-build — node:20-alpine → compiles the SPA (Vite) into /app/dist
#    builder         — rust:1-slim-bookworm → compiles the server binary
#    runtime         — gcr.io/distroless/cc-debian12 → runs /app/server
#  The frontend is built INSIDE the image, so no separate build step is needed.
#  SQL migrations are embedded in the binary at compile time (sqlx::migrate!),
#  so no migrations/ directory is required at runtime.
# =============================================================================

# ── Frontend build stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy only manifests first — Docker layer caching for `npm ci`
COPY frontend/package.json frontend/package-lock.json ./
# NOTE: strict-ssl is relaxed ONLY for this build stage because corporate
# networks with SSL inspection (Zscaler, antivirus MITM) present a custom
# certificate that alpine's trust store doesn't include, which makes npm fail
# with UNABLE_TO_GET_ISSUER_CERT_LOCALLY. npm still downloads exclusively
# from the official npm registry; this only disables certificate verification
# during the frontend dependency install inside the build.
RUN npm config set strict-ssl false && npm ci

# Copy the rest of the frontend and build the SPA (output: /app/dist)
COPY frontend/ ./
RUN npm run build


# ── Builder stage ────────────────────────────────────────────────────────────
FROM rust:1-slim-bookworm AS builder

# Build-time system dependencies for sqlx (postgres) / openssl
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Corporate networks with SSL inspection (Zscaler, antivirus MITM) present a
# custom certificate when cargo reaches crates.io, which makes the build fail
# with "download of config.json failed". Trusting the Zscaler root CA keeps
# dependency downloads working in such environments. It is harmless elsewhere
# (it only adds a CA, never removes system trust).
COPY docker/certs/zscaler-root.pem /usr/local/share/ca-certificates/zscaler-root.crt
RUN update-ca-certificates

WORKDIR /app

# Copy only manifest files first — Docker layer caching for dependencies
COPY Cargo.toml Cargo.lock ./
COPY server/Cargo.toml server/
COPY bridge/Cargo.toml bridge/

# Create dummy sources so `cargo build` can fetch & compile dependencies
RUN mkdir -p server/src bridge/src && \
    echo "fn main() {}" > server/src/main.rs && \
    echo "fn main() {}" > bridge/src/main.rs

# Build dependency layer (will warn about unused deps — that's expected)
RUN cargo build --release -p server 2>/dev/null; echo "Dependency cache populated"

# Now copy the real source code (includes server/migrations — required at
# compile time because sqlx::migrate! embeds them into the binary)
COPY . .

# Force rebuild of the actual main.rs so cached deps are reused
RUN touch server/src/main.rs

# Full production build — only the server crate
RUN cargo build --release -p server


# ── Runtime stage ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/cc-debian12

WORKDIR /app

# Only the compiled binary — no OS layer, no shell, no package manager
COPY --from=builder /app/target/release/server /app/server

# Pre-built SPA (Vite output), served by the backend at /app/frontend/dist
COPY --from=frontend-build /app/dist /app/frontend/dist

# Default server port (overridable via PORT env var at runtime)
EXPOSE 9001

ENTRYPOINT ["/app/server"]
