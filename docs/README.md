# RevenuePilot Handbook

This handbook provides the canonical overview for the RevenuePilot
application. It consolidates the previous planning notes into a single
reference covering the product surface, the development workflow and the
supporting tooling.

## Product snapshot

RevenuePilot is a desktop-ready clinical documentation assistant built
with React, FastAPI and Electron. It lets clinicians capture notes,
receive coding/compliance guidance, manage reusable templates, record
visit audio, and export finalized encounters while administrators manage
users, notifications and analytics.

Key capabilities include:

- **Rich clinical workspace** with draft and beautified tabs, template
  insertion, chart uploads, transcript review and clipboard/export
  helpers.【F:src/App.jsx†L1-L118】【F:src/components/NoteEditor.jsx†L1-L120】
- **AI assistance** for beautification, coding, compliance, public health,
  differential diagnoses and follow-up scheduling, with offline and local
  model fallbacks.【F:backend/main.py†L9755-L11904】【F:backend/openai_client.py†L1-L117】
- **Operational tooling** such as analytics dashboards, audit logs,
  notifications, workflow finalisation APIs and schedule management for
  administrators.【F:src/components/Dashboard.jsx†L1-L120】【F:backend/main.py†L7536-L12239】
- **Packaging support** for Electron builds with code signing and update
  testing, plus scripts for fetching icons and bundling the backend.【F:package.json†L11-L94】【F:docs/DESKTOP_BUILD.md†L1-L68】

## Repository layout

```
revenuepilot/
├── backend/                # FastAPI application, data models and seeds
├── docs/                   # Handbook (this file) and focused guides
├── revenuepilot-frontend/  # Standalone workspace for Vite development
├── src/                    # React application consumed by Electron
├── tests/                  # Backend regression, workflow and API tests
├── scripts/                # Build helpers, icon fetcher and update server
└── electron/               # Electron shell entrypoints
```

Important directories and files are cross-linked throughout this handbook
and the specialised documents listed in [Additional references](#additional-references).

## Development workflow

### Install dependencies

Run the platform-aware installer once. It sets up Node workspaces and a
Python virtual environment for the FastAPI backend.

```bash
./install.sh          # macOS/Linux
# or
./install.ps1         # Windows PowerShell
```

The script installs frontend packages, creates `backend/venv`, and
installs backend requirements including spaCy’s English model.【F:install.sh†L1-L55】

### Start the full stack

Use the helper script to launch FastAPI and the Vite frontend together.

```bash
./start.sh            # macOS/Linux
# or
./start.ps1           # Windows PowerShell
```

The script provisions local JWT and mock OpenAI secrets via the backend
secrets manager, runs `backend/venv/bin/uvicorn backend.main:app
--reload` on port 8000, exports `VITE_API_URL` and starts the frontend
dev server. Stopping the frontend terminates the backend process
automatically.【F:start.sh†L1-L48】

For manual startup, activate the virtualenv and run the servers
separately:

```bash
source backend/venv/bin/activate
uvicorn backend.main:app --reload --port 8000

VITE_API_URL=http://localhost:8000 npm run dev
```

### Run tests and quality checks

The repository ships with Python, JavaScript and end-to-end suites.
Execute them from the project root:

```bash
# Backend unit/integration tests with coverage
backend/venv/bin/pytest

# Frontend unit tests & coverage
npm run test:coverage

# Playwright e2e smoke tests (requires browsers installed once)
npm run test:e2e
```

The CI pipeline mirrors these commands and enforces linting via ESLint
and Prettier for the frontend plus Ruff/pytest on the backend.【F:package.json†L13-L36】【F:ci.sh†L1-L80】

## Feature tour

### Clinical documentation workspace

- **Tabbed note editor** – Draft and beautified tabs share a rich-text
  editor with toolbar controls, patient/encounter tracking, chart upload
  support and audio transcription. Auto-save persists per patient and
  encounter, with server-side versions tracked through the notes API.【F:src/App.jsx†L34-L236】【F:backend/main.py†L7970-L8046】
- **Templates and snippets** – Base templates load from the backend with
  offline caching and CRUD actions for user-defined templates. Templates
  can be filtered by specialty and payer context.【F:src/components/TemplatesModal.jsx†L1-L200】【F:backend/templates.py†L1-L160】
- **Suggestion panel** – Categorised AI suggestions (codes, compliance,
  public health, differentials, follow-up) respond to note edits,
  specialty and payer selections, and can export calendar events.【F:src/components/SuggestionPanel.jsx†L1-L160】【F:backend/main.py†L11348-L12124】
- **Transcription tools** – Optional visit recording captures diarised
  transcripts and merges segments into the note. The backend supports
  Whisper, local models and offline fallbacks.【F:src/components/TranscriptView.jsx†L1-L200】【F:backend/audio_processing.py†L1-L200】

### Administrative & operational views

- **Dashboard** – Admin-only charts summarise baseline vs current usage,
  revenue metrics and denial rates, with export to PDF support.【F:src/components/Dashboard.jsx†L1-L160】
- **Audit & activity logs** – Recent events stream from `/events` while
  structured audit entries are available under `/api/activity/log`.【F:src/components/Logs.jsx†L1-L160】【F:backend/main.py†L7664-L8912】
- **User management** – Admins invite, update and deactivate users via
  JWT-protected endpoints. MFA, refresh tokens and session validation are
  handled by the backend auth module.【F:src/components/AdminUsers.jsx†L1-L120】【F:backend/main.py†L3199-L4079】
- **Notifications & surveys** – Persistent notifications, unread counts
  and satisfaction surveys are surfaced in the React shell and persisted
  through `/api/notifications` endpoints.【F:src/components/Notifications.jsx†L1-L200】【F:backend/main.py†L6530-L6636】
- **Scheduling** – Follow-up recommendations export calendar events while
  the scheduler module manages appointments and bulk operations.【F:src/components/FollowUpScheduler.jsx†L1-L160】【F:backend/scheduling.py†L1-L240】

### Backend services

- **AI orchestration** – `backend/main.py` exposes REST and WebSocket
  endpoints for beautify, suggestions, compliance checks, real-time
  analysis and note summarisation. Each call de-identifies input, caches
  guidelines and records analytics events.【F:backend/main.py†L9755-L12124】
- **OpenAI/local model selection** – The client wrapper supports
  deterministic offline placeholders, llama.cpp local models and remote
  OpenAI Chat Completions with per-request key lookup.【F:backend/openai_client.py†L1-L117】
- **FHIR export** – Finalized notes and selected codes convert to FHIR
  transaction bundles and optionally post to configured EHR endpoints.
  OAuth2 credentials are cached and fall back to basic/token auth.【F:backend/main.py†L8141-L8198】【F:backend/ehr_integration.py†L1-L240】
- **Persistence** – SQLite tables maintain users, settings, templates,
  analytics events, notifications, compliance rules and visit sessions via
  idempotent migrations triggered on startup.【F:backend/migrations.py†L1-L360】【F:backend/main.py†L2700-L2820】

### Frontend infrastructure

- **Internationalisation** – `react-i18next` powers localisation with
  JSON translation bundles stored under `src/locales/`. The language can
  be selected in user settings and prompts honour `lang` fields.【F:src/i18n.js†L1-L120】【F:backend/main.py†L4239-L4333】
- **Offline resilience** – Local caches retain templates, notes and code
  metadata, while an offline queue replays mutations once connectivity is
  restored.【F:src/api.js†L1-L170】【F:src/api.js†L170-L320】
- **Authentication context** – JWT access and refresh tokens persist in
  localStorage with automatic refresh handled by `refreshAccessToken` and
  guarded routes in the React shell.【F:src/api.js†L320-L520】【F:src/components/Login.jsx†L1-L200】

## Environment configuration

Key environment variables can be supplied via `.env` or exported before
runtime:

- `VITE_API_URL` – Frontend API base URL (set automatically by `start.sh`).
- `OPENAI_API_KEY` and `OPENAI_API_KEY_ROTATED_AT` – Backend OpenAI key
  plus ISO-8601 rotation timestamp supplied by the external secrets
  manager. `/apikey` persists development overrides through the secrets
  repository.
- `USE_OFFLINE_MODEL`, `USE_LOCAL_MODELS`, `LOCAL_*_MODEL` – Offline/local
  AI behaviour toggles.【F:backend/openai_client.py†L1-L117】
- `FHIR_SERVER_URL` and related auth variables – Configure FHIR export
  destinations.【F:backend/ehr_integration.py†L30-L180】
- `REVENUEPILOT_DB_PATH`, `JWT_SECRET`, `JWT_SECRET_ROTATED_AT`,
  `METRICS_LOOKBACK_DAYS` – Database location, token signing secret with
  rotation metadata, and analytics retention window.【F:backend/main.py†L600-L760】
- `SECRETS_BACKEND`, `SECRETS_FALLBACK`, `SECRET_MAX_AGE_DAYS` – Control
  whether secrets are loaded from environment managers only or allow the
  encrypted local fallback, and configure stale-secret enforcement.【F:backend/key_manager.py†L85-L230】

See `docs/LOCAL_MODELS.md` for detailed offline model guidance and
`docs/DESKTOP_BUILD.md` for packaging environment variables.

## Deployment notes

Electron packaging bundles the React build, backend virtualenv and assets
into signed installers. After setting up `.env`, run:

```bash
npm run electron:build
npm run update-server   # optional local auto-update feed
```

The generated artifacts live in `dist/` and can be distributed per
platform. Refer to [Desktop Build and Auto-Update Guide](DESKTOP_BUILD.md)
for certificate management and smoke tests.【F:docs/DESKTOP_BUILD.md†L1-L80】

Production deployments should source `OPENAI_API_KEY`, `JWT_SECRET` and
other credentials from an external secrets manager (Vault, SSM, etc.)
and provide the corresponding `*_ROTATED_AT` metadata so the backend can
enforce rotation policies. Set `SECRETS_BACKEND=env` and leave
`SECRETS_FALLBACK=never` in hosted environments; the development scripts
only provision local fallbacks when `ENVIRONMENT` is a development value.【F:backend/key_manager.py†L85-L230】【F:start.sh†L1-L48】

## Additional references

- [ARCHITECTURE.md](ARCHITECTURE.md) – Deep dive into module
  responsibilities and data flow.
- [LOCAL_MODELS.md](LOCAL_MODELS.md) – Offline/edge model setup.
- [PROMPT_TEMPLATES.md](PROMPT_TEMPLATES.md) – Customising prompt
  instructions.
- [finalization_workflow_regression.md](finalization_workflow_regression.md) –
  Step-by-step API regression guide.
- [SOP.md](SOP.md) – Day-to-day development process and CI expectations.
- [`docs/archive/`](archive/README.md) – Historical planning documents kept
  for context.

This handbook should be treated as the single source of truth; update it
whenever behaviour or tooling changes.
