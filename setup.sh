#!/bin/bash
# Master setup script to install dependencies and build the RevenuePilot desktop package.

set -e

# Determine project root and switch to it
SCRIPT_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPT_DIR"

# Install prerequisites and project dependencies
./install.sh

# Build the packaged Electron application
npm run electron:build

echo "Build complete. Artifacts are in the dist/ directory."
