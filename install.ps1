Write-Host "Installing RevenuePilot..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing via winget..."
    winget install -e --id OpenJS.NodeJS
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python not found. Installing via winget..."
    winget install -e --id Python.Python.3
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir
$frontendDir = Join-Path $scriptDir 'revenuepilot-frontend'

Write-Host "Installing Node dependencies..."
npm install

Write-Host "Installing standalone frontend dependencies..."
npm install --prefix $frontendDir

Write-Host "Setting up Python backend..."
Set-Location backend
python -m venv venv
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
deactivate

Set-Location $scriptDir

Write-Host "Provisioning development secrets..."
$pythonExe = Join-Path $scriptDir 'backend\venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
    $pythonExe = 'python'
}
$provisionScript = @'
import os
import secrets

from backend import key_manager

os.environ.setdefault("ENVIRONMENT", "development")
key_manager.ensure_local_secret("jwt", "JWT_SECRET", lambda: secrets.token_urlsafe(48))
key_manager.ensure_local_secret(
    "openai", "OPENAI_API_KEY", lambda: "sk-local-" + secrets.token_hex(16)
)
'@
& $pythonExe -c $provisionScript

Write-Host "Installation complete."
Write-Host "Run ./start.ps1 (or ./start.sh on macOS/Linux) to launch the full stack with development secrets provisioned."
