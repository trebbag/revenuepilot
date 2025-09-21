#!/bin/bash
# Cross-platform installation script for the RevenuePilot application.

set -e

echo "Installing RevenuePilot..."

OS=$(uname -s)

if [[ "$OS" == "Darwin" ]]; then
  # macOS using Homebrew
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js not found. Installing Node.js..."
    brew install node
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Python3 not found. Installing Python3..."
    brew install python
  fi
elif [[ "$OS" == "Linux" ]]; then
  # Debian-based Linux
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js not found. Installing Node.js..."
    sudo apt-get update && sudo apt-get install -y nodejs npm
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Python3 not found. Installing Python3..."
    sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip
  fi
else
  echo "Unsupported operating system: $OS"
  exit 1
fi

# Navigate to the extracted project directory
SCRIPT_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPT_DIR"

echo "Installing Node dependencies..."
npm install

echo "Installing standalone frontend dependencies..."
npm --prefix revenuepilot-frontend install

echo "Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
deactivate

cd "$SCRIPT_DIR"

echo "Provisioning development secrets..."
backend/venv/bin/python - <<'PY'
import os
import secrets

from backend import key_manager

os.environ.setdefault("ENVIRONMENT", "development")
key_manager.ensure_local_secret("jwt", "JWT_SECRET", lambda: secrets.token_urlsafe(48))
key_manager.ensure_local_secret(
    "openai", "OPENAI_API_KEY", lambda: "sk-local-" + secrets.token_hex(16)
)
PY

echo "Installation complete."
echo "Run ./start.sh (or ./start.ps1 on Windows) to launch the full stack with development secrets provisioned."
