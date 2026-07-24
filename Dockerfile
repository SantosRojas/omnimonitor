# =============================================================================
#  omni-pdms-v2 — multi-stage Docker build
#  Target: production server binary (axum REST + WebSocket)
#  Base:   rust:1-slim-bookworm (builder) → gcr.io/distroless/cc-debian12 (runtime)
# =============================================================================

# ── Builder stage ────────────────────────────────────────────────────────────
FROM rust:1-slim-bookworm AS builder

# Build-time system dependencies for sqlx (postgres) / openssl
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

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

# Now copy the real source code
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

# Default server port (overridable via PORT env var at runtime)
EXPOSE 9001

ENTRYPOINT ["/app/server"]
