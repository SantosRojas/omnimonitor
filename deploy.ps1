<#
.SYNOPSIS
  Build + package omni-pdms-v2 for production deployment.

.DESCRIPTION
  This script:
    1. Builds the server image (multi-stage Dockerfile — includes the
       frontend SPA, built inside the image)
    2. Exports the image to a .tar file
    3. Prints deployment instructions for the hospital server

  Uses Docker if available, otherwise Podman (compatible CLI).

  Run this on your DEVELOPMENT MACHINE, then copy the .tar to the server.

.EXAMPLE
  .\deploy.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath

$imageName = "omni-pdms-server"
$tag = "latest"
$exportFile = "$imageName.tar"

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerCmd = 'docker'
} elseif (Get-Command podman -ErrorAction SilentlyContinue) {
    $dockerCmd = 'podman'
} else {
    throw "Neither docker nor podman was found in PATH"
}

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  omni-pdms-v2 — Deploy Package              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Runtime: $dockerCmd" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Build image ──────────────────────────────────────────────────────
Write-Host "▸ Step 1/2 — Building image (frontend included)..." -ForegroundColor Yellow
Write-Host "  Image: ${imageName}:${tag}"
& $dockerCmd build -t "${imageName}:${tag}" "$root"
if ($LASTEXITCODE -ne 0) {
    throw "$dockerCmd build failed (exit code: $LASTEXITCODE)"
}
Write-Host "  ✓ Image built: ${imageName}:${tag}" -ForegroundColor Green

# ── Step 2: Export image ─────────────────────────────────────────────────────
Write-Host "▸ Step 2/2 — Exporting image to ${exportFile}..." -ForegroundColor Yellow
& $dockerCmd save "${imageName}:${tag}" -o "$root/$exportFile"
if ($LASTEXITCODE -ne 0) {
    throw "$dockerCmd save failed (exit code: $LASTEXITCODE)"
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
Write-Host ""
Write-Host "  On the hospital server, run:" -ForegroundColor White
Write-Host "    docker load -i $exportFile" -ForegroundColor Yellow
Write-Host '    docker compose up -d' -ForegroundColor Yellow
Write-Host ""
Write-Host "  Verify health:" -ForegroundColor White
Write-Host "    curl http://localhost:9001/health" -ForegroundColor Yellow
Write-Host ""
Write-Host "  See DEPLOY.md for full instructions." -ForegroundColor White
