#!/bin/bash
# Installation script for the RevenuePilot application on macOS.

set -e

echo "Installing RevenuePilot..."

# Check for Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Ensure Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing Node.js..."
  brew install node
fi

# Ensure Python 3 is installed
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python3 not found. Installing Python3..."
  brew install python
fi

# Navigate to the extracted project directory
SCRIPT_DIR="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd "$SCRIPT_DIR"

echo "Installing Node dependencies..."
npm install

echo "Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

echo "Installation complete."
echo "To start the backend server, run:"
echo "  cd $(pwd) && source venv/bin/activate && uvicorn main:app --reload --port 8000"
echo "To run the front-end, open a new terminal, navigate to the project root and run:"
echo "  npm run dev"