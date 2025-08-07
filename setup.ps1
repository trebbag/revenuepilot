Write-Host "Setting up RevenuePilot and building package..."

& "$PSScriptRoot/install.ps1"

npm run electron:build

Write-Host "Build complete. Artifacts are in the dist/ directory."
