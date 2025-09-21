# Start both the backend and the frontend for RevenuePilot in development mode.
# This script assumes you have already installed dependencies via install.ps1
# and that you are running it from the project root.

Write-Host "Starting RevenuePilot development environment..."

# Determine script directory and switch to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

if (-not $env:ENVIRONMENT) {
    $env:ENVIRONMENT = "development"
}
$pythonExe = Join-Path $scriptDir 'backend\venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
    $pythonExe = 'python'
}
$provisionScript = @'
import os
import secrets

from backend import key_manager

env = os.getenv("ENVIRONMENT", "development").lower()
if env in {"development", "dev", "local"}:
    key_manager.ensure_local_secret("jwt", "JWT_SECRET", lambda: secrets.token_urlsafe(48))
    key_manager.ensure_local_secret(
        "openai", "OPENAI_API_KEY", lambda: "sk-local-" + secrets.token_hex(16)
    )
else:
    failures = []
    for name, env_var in key_manager.SECRET_ENV_MAPPING.items():
        try:
            key_manager.require_secret(
                name,
                env_var,
                allow_fallback=False,
                allow_missing_rotation=False,
            )
        except key_manager.SecretRotationError as exc:
            failures.append(f"{env_var}: {exc}")
        except key_manager.SecretError as exc:
            failures.append(f"{env_var}: {exc}")
    if failures:
        details = "\n - ".join(failures)
        raise SystemExit(
            "Required secrets are missing or invalid. Provision them in the configured secrets backend before starting the stack:\n - "
            + details
        )
'@
& $pythonExe -c $provisionScript

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

