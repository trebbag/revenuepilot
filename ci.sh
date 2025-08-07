#!/usr/bin/env bash
set -euo pipefail

ruff check backend
pytest
npm run lint
npx vitest run --coverage
