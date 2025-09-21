#!/usr/bin/env bash
set -euo pipefail

backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head

ruff check backend
pytest --cov=backend --cov-report=term
npm run lint
npm run test:coverage
npx playwright install --with-deps chromium
npm run test:e2e
