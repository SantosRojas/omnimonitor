#!/usr/bin/env bash
# ==============================================================================
#  omni-pdms-v2 — Deploy Package (Linux / macOS)
# ==============================================================================
#
#  Builds the server image (multi-stage Dockerfile — includes the frontend
#  SPA, built inside the image) and exports it as a .tar file ready to copy
#  to the hospital server.
#
#  Uses Docker if available, otherwise Podman (compatible CLI).
#
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh
#
#  Then copy omni-pdms-server.tar + docker-compose.yml + .env to the server
#  and run:
#    docker load -i omni-pdms-server.tar
#    docker compose up -d
# ==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="omni-pdms-server"
TAG="latest"
EXPORT_FILE="${IMAGE_NAME}.tar"

# Detect the container runtime: prefer Docker, fall back to Podman
if command -v docker >/dev/null 2>&1; then
    DOCKER_CMD="docker"
elif command -v podman >/dev/null 2>&1; then
    DOCKER_CMD="podman"
else
    echo "ERROR: neither docker nor podman was found in PATH" >&2
    exit 1
fi

# ── Colours ──────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  omni-pdms-v2 — Deploy Package              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Runtime: ${DOCKER_CMD}"
echo ""

# ── Step 1: Build image ──────────────────────────────────────────────────────
echo -e "${YELLOW}▸ Step 1/2 — Building image (frontend included)...${NC}"
echo "  Image: ${IMAGE_NAME}:${TAG}"
"$DOCKER_CMD" build -t "${IMAGE_NAME}:${TAG}" "$ROOT"
echo -e "  ${GREEN}✓ Image built: ${IMAGE_NAME}:${TAG}${NC}"

# ── Step 2: Export image ─────────────────────────────────────────────────────
echo -e "${YELLOW}▸ Step 2/2 — Exporting image to ${EXPORT_FILE}...${NC}"
"$DOCKER_CMD" save "${IMAGE_NAME}:${TAG}" -o "$ROOT/$EXPORT_FILE"
echo -e "  ${GREEN}✓ Exported: $ROOT/$EXPORT_FILE${NC}"
echo ""

# ── Done — print instructions ─────────────────────────────────────────────────
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Package ready — deploy to hospital server   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Files to copy:"
echo -e "    ${GREEN}• ${EXPORT_FILE}${NC}"
echo -e "    ${GREEN}• docker-compose.yml${NC}"
echo -e "    ${GREEN}• .env (with production secrets)${NC}"
echo ""
echo "  On the hospital server, run:"
echo -e "    ${YELLOW}docker load -i ${EXPORT_FILE}${NC}"
echo -e "    ${YELLOW}docker compose up -d${NC}"
echo ""
echo "  Verify health:"
echo -e "    ${YELLOW}curl http://localhost:9001/health${NC}"
echo ""
echo "  See DEPLOY.md for full instructions."
