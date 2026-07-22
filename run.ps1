<# .SYNOPSIS
  Build frontend and start the backend server serving the compiled SPA.
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Building frontend..."                         -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Push-Location "$root/frontend"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Write-Host "`n✓ Frontend compiled successfully`n" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Starting server...                           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan

cargo run -p server
