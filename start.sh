#!/bin/bash
# Start both the backend and the frontend for RevenuePilot in development mode.
# This script assumes you have already installed dependencies via install.sh
# and that you are running it from the project root.

set -e

# Determine script directory and switch to project root
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

export ENVIRONMENT="${ENVIRONMENT:-development}"

if [ -x "backend/venv/bin/python" ]; then
  BACKEND_PYTHON="backend/venv/bin/python"
else
  BACKEND_PYTHON="python3"
fi

"$BACKEND_PYTHON" - <<'PY'
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
PY

echo "Starting backend (FastAPI) on port 8000..."

# Start backend in background.  --reload enables live code reloading.
backend/venv/bin/uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Ensure the backend is terminated when this script exits
trap "echo 'Stopping backend...'; kill $BACKEND_PID" EXIT

echo "Backend started with PID $BACKEND_PID"

# Export VITE_API_URL so the frontend knows where to reach the backend
export VITE_API_URL="http://localhost:8000"

echo "Starting frontend (Vite) on default port..."

# Start the React development server from the workspace. This blocks until exit (Ctrl+C).
npm --workspace revenuepilot-frontend run dev

# When the frontend exits, the trap will kill the backend.
