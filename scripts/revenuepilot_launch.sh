#!/usr/bin/env bash
# One-click dev launcher for macOS: starts backend + frontend (if needed) and opens a Chrome app window.
set -Eeuo pipefail

# --- Resolve repo paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONT_DIR="$REPO_ROOT/revenuepilot-frontend"
BACK_DIR="$REPO_ROOT"

# --- Ports / URLs (override via env if desired) ---
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONT_URL="${FRONT_URL:-http://localhost:${FRONTEND_PORT}}"

# --- Logs ---
LOG_DIR="${LOG_DIR:-$HOME/Library/Logs/RevenuePilot}"
mkdir -p "$LOG_DIR"

is_listening() { lsof -PiTCP:"$1" -sTCP:LISTEN -n >/dev/null 2>&1; }

start_backend() {
  if is_listening "$BACKEND_PORT"; then return 0; fi
  cd "$BACK_DIR"
  # Prefer venv, then poetry, then system python
  if [[ -x ".venv/bin/python" ]]; then PY=".venv/bin/python"
  elif command -v poetry >/dev/null 2>&1; then PY="poetry run python"
  else PY="python"; fi
  nohup $PY -m uvicorn backend.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload >>"$LOG_DIR/backend.log" 2>&1 &
}

start_frontend() {
  if is_listening "$FRONTEND_PORT"; then return 0; fi
  cd "$FRONT_DIR"
  if [[ -f "pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then DEV_CMD="pnpm dev"; else DEV_CMD="npm run dev"; fi
  nohup bash -lc "$DEV_CMD" >>"$LOG_DIR/frontend.log" 2>&1 &
}

wait_port() {
  local port=$1; local attempts=${2:-60}; local i=0
  until is_listening "$port" || (( i >= attempts )); do sleep 0.5; ((i++)); done
}

start_backend
start_frontend
wait_port "$BACKEND_PORT" 60
wait_port "$FRONTEND_PORT" 60

# Open in a chromeless window (looks like a native app)
if /usr/bin/open -Ra "Google Chrome" >/dev/null 2>&1; then
  open -na "Google Chrome" --args --app="$FRONT_URL"
else
  open "$FRONT_URL"
fi
