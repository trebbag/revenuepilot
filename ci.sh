#!/usr/bin/env bash
set -euo pipefail

export DB_POOL_SIZE="${DB_POOL_SIZE:-5}"
export DB_MAX_OVERFLOW="${DB_MAX_OVERFLOW:-10}"
export STATEMENT_TIMEOUT_MS="${STATEMENT_TIMEOUT_MS:-30000}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export REVENUEPILOT_DB_PATH="${REVENUEPILOT_DB_PATH:-$(pwd)/.tmp/ci.db}"
mkdir -p "$(dirname "$REVENUEPILOT_DB_PATH")"

backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head
backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini check

ruff check backend
pytest --cov=backend --cov-report=term

if [[ "${RUN_PG_TESTS:-0}" == "1" ]]; then
  : "${TEST_DATABASE_URL:?TEST_DATABASE_URL must be set when RUN_PG_TESTS=1}"
  export DATABASE_URL="$TEST_DATABASE_URL"
  export REVENUEPILOT_DATABASE_URL="$TEST_DATABASE_URL"
  export RUN_PG_TESTS=1
  backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head
  backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini check
  pytest -m postgres --maxfail=1 --disable-warnings -q
fi

npm run lint
npm run test:coverage
npx playwright install --with-deps chromium
npm run test:e2e
