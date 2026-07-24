<#
.SYNOPSIS
  Build + package omni-pdms-v2 for production deployment.

.DESCRIPTION
  This script:
    1. Builds the frontend SPA (Vite)
    2. Builds the server Docker image (multi-stage)
    3. Exports the image to a .tar file
    4. Prints deployment instructions for the hospital server

  Run this on your DEVELOPMENT MACHINE, then copy the .tar to the server.

.EXAMPLE
  .\deploy.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath

$imageName = "omni-pdms-server"
$tag = "latest"
$exportFile = "$imageName.tar"

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  omni-pdms-v2 — Deploy Package              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Build frontend ───────────────────────────────────────────────────
Write-Host "▸ Step 1/3 — Building frontend (Vite)..." -ForegroundColor Yellow
Push-Location "$root/frontend"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed (exit code: $LASTEXITCODE)"
    }
    Write-Host "  ✓ Frontend built: frontend/dist/" -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Step 2: Build Docker image ───────────────────────────────────────────────
Write-Host "▸ Step 2/3 — Building Docker image (multi-stage)..." -ForegroundColor Yellow
Write-Host "  Image: ${imageName}:${tag}"
docker build -t "${imageName}:${tag}" "$root"
if ($LASTEXITCODE -ne 0) {
    throw "Docker build failed (exit code: $LASTEXITCODE)"
}
Write-Host "  ✓ Image built: ${imageName}:${tag}" -ForegroundColor Green

# ── Step 3: Export image ─────────────────────────────────────────────────────
Write-Host "▸ Step 3/3 — Exporting image to ${exportFile}..." -ForegroundColor Yellow
docker save "${imageName}:${tag}" -o "$root/$exportFile"
if ($LASTEXITCODE -ne 0) {
    throw "Docker save failed (exit code: $LASTEXITCODE)"
}
Write-Host "  ✓ Exported: $root/$exportFile" -ForegroundColor Green
Write-Host ""

# ── Done — print instructions ─────────────────────────────────────────────────
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Package ready — deploy to hospital server   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Files to copy:" -ForegroundColor White
Write-Host "    • $exportFile" -ForegroundColor Green
Write-Host "    • docker-compose.yml" -ForegroundColor Green
Write-Host "    • .env (with production secrets)" -ForegroundColor Green
if (Test-Path "$root/frontend/dist") {
    Write-Host "    • frontend/dist/  (or rebuild on server)" -ForegroundColor Green
}
Write-Host ""
Write-Host "  On the hospital server, run:" -ForegroundColor White
Write-Host "    docker load -i $exportFile" -ForegroundColor Yellow
Write-Host '    docker compose up -d' -ForegroundColor Yellow
Write-Host ""
Write-Host "  Verify health:" -ForegroundColor White
Write-Host "    curl http://localhost:9001/health" -ForegroundColor Yellow
Write-Host ""
Write-Host "  See DEPLOY.md for full instructions." -ForegroundColor White
