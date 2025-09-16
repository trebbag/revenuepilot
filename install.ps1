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

Write-Host "Installation complete."
Write-Host "To start the backend server, run:"
Write-Host "  cd backend; .\\venv\\Scripts\\Activate.ps1; uvicorn main:app --reload --port 8000"
Write-Host "To run the front-end, open a new terminal and run:"
Write-Host "  npm run dev"
