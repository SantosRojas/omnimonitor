#!/usr/bin/env bash
# ==============================================================================
#  omni-pdms-v2 — Deploy Package (Linux / macOS)
# ==============================================================================
#
#  Builds the frontend SPA, builds the Docker image, and exports it as a .tar
#  file ready to copy to the hospital server.
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

# ── Colours ──────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  omni-pdms-v2 — Deploy Package              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Build frontend ───────────────────────────────────────────────────
echo -e "${YELLOW}▸ Step 1/3 — Building frontend (Vite)...${NC}"
pushd "$ROOT/frontend" > /dev/null
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed" >&2
    exit 1
fi
popd > /dev/null
echo -e "  ${GREEN}✓ Frontend built: frontend/dist/${NC}"

# ── Step 2: Build Docker image ───────────────────────────────────────────────
echo -e "${YELLOW}▸ Step 2/3 — Building Docker image (multi-stage)...${NC}"
echo "  Image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" "$ROOT"
if [ $? -ne 0 ]; then
    echo "ERROR: Docker build failed" >&2
    exit 1
fi
echo -e "  ${GREEN}✓ Image built: ${IMAGE_NAME}:${TAG}${NC}"

# ── Step 3: Export image ─────────────────────────────────────────────────────
echo -e "${YELLOW}▸ Step 3/3 — Exporting image to ${EXPORT_FILE}...${NC}"
docker save "${IMAGE_NAME}:${TAG}" -o "$ROOT/$EXPORT_FILE"
if [ $? -ne 0 ]; then
    echo "ERROR: Docker save failed" >&2
    exit 1
fi
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
if [ -d "$ROOT/frontend/dist" ]; then
    echo -e "    ${GREEN}• frontend/dist/  (or rebuild on server)${NC}"
fi
echo ""
echo "  On the hospital server, run:"
echo -e "    ${YELLOW}docker load -i ${EXPORT_FILE}${NC}"
echo -e "    ${YELLOW}docker compose up -d${NC}"
echo ""
echo "  Verify health:"
echo -e "    ${YELLOW}curl http://localhost:9001/health${NC}"
echo ""
echo "  See DEPLOY.md for full instructions."
