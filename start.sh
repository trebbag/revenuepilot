#!/bin/bash
# Start both the backend and the frontend for RevenuePilot in development mode.
# This script assumes you have already installed dependencies via install.sh
# and that you are running it from the project root.

set -e

# Determine script directory and switch to project root
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Starting backend (FastAPI) on port 8000..."

# Start backend in background.  --reload enables live code reloading.
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Ensure the backend is terminated when this script exits
trap "echo 'Stopping backend...'; kill $BACKEND_PID" EXIT

echo "Backend started with PID $BACKEND_PID"

# Export VITE_API_URL so the frontend knows where to reach the backend
export VITE_API_URL="http://localhost:8000"

echo "Starting frontend (Vite) on default port..."

# Start the React development server.  This will block until you exit it (Ctrl+C).
npm run dev

# When the frontend exits, the trap will kill the backend.