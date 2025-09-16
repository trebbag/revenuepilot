Write-Host "Setting up RevenuePilot and building package..."

& "$PSScriptRoot/install.ps1"

Set-Location $PSScriptRoot
$frontendDir = Join-Path $PSScriptRoot 'revenuepilot-frontend'

Write-Host "Building standalone frontend bundle..."
npm run build --prefix $frontendDir

npm run electron:build

Write-Host "Build complete. Artifacts are in the dist/ directory."
