# Start both the backend and the frontend for RevenuePilot in development mode.
# This script assumes you have already installed dependencies via install.ps1
# and that you are running it from the project root.

Write-Host "Starting RevenuePilot development environment..."

# Determine script directory and switch to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "Starting backend (FastAPI) on port 8000..."
$uvicornPath = Join-Path $scriptDir 'backend\venv\Scripts\uvicorn.exe'
$backend = Start-Process $uvicornPath -ArgumentList 'backend.main:app --reload --port 8000' -PassThru

try {
    Write-Host "Backend started with PID $($backend.Id)"

    # Export VITE_API_URL so the frontend knows where to reach the backend
    $env:VITE_API_URL = "http://localhost:8000"

    Write-Host "Starting frontend (Vite) on default port..."
    npm --workspace revenuepilot-frontend run dev
}
finally {
    Write-Host "Stopping backend..."
    Stop-Process -Id $backend.Id
}

