#!/usr/bin/env bash
# ==============================================================================
#  omni-pdms-v2 — Development server (Linux / macOS)
# ==============================================================================
#
#  Builds the frontend SPA and starts the backend server on the same machine.
#  Requires PostgreSQL running locally (or accessible via .env config).
#
#  Usage:
#    chmod +x run.sh
#    ./run.sh
#
#  For production deployment, see DEPLOY.md or use deploy.sh.
# ==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════════════╗"
echo "║  Building frontend...                        ║"
echo "╚══════════════════════════════════════════════╝"

pushd "$ROOT/frontend" > /dev/null
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Frontend build failed" >&2
    exit 1
fi
echo ""
echo "✓ Frontend compiled successfully"
echo ""
popd > /dev/null

echo "╔══════════════════════════════════════════════╗"
echo "║  Starting server...                          ║"
echo "╚══════════════════════════════════════════════╝"

cargo run -p server
