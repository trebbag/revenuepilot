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
  helpers.【F:revenuepilot-frontend/src/App.tsx†L1-L69】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L800-L870】
- **Finalization workflow** guiding validation, attestation and dispatch
  from a dedicated wizard that preserves encounter context and returns the
  clinician to the previous view when complete.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L785-L820】【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L1433-L1479】
- **AI assistance** for beautification, coding, compliance, public health,
  differential diagnoses and follow-up scheduling, with offline and local
  model fallbacks.【F:backend/main.py†L9755-L11904】【F:backend/openai_client.py†L1-L117】
- **Operational tooling** such as analytics dashboards, audit logs,
  notifications, workflow finalisation APIs and schedule management for
  administrators.【F:revenuepilot-frontend/src/components/Dashboard.tsx†L1-L192】【F:backend/main.py†L7536-L12239】
- **Packaging support** for Electron builds with code signing and update
  testing, plus scripts for fetching icons and bundling the backend.【F:package.json†L11-L94】【F:docs/DESKTOP_BUILD.md†L1-L68】

## Repository layout

```
revenuepilot/
├── backend/                # FastAPI application, data models and seeds
├── docs/                   # Handbook (this file) and focused guides
├── revenuepilot-frontend/  # TypeScript workspace that builds the React UI
├── src/                    # Legacy JavaScript shell retained for reference
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

### Apply database migrations

Run Alembic migrations before starting services to ensure the SQLite
schema matches the current application expectations (the same command
runs in CI and production deployments):

```bash
backend/venv/bin/python -m alembic -c backend/alembic/alembic.ini upgrade head
```


### Database migration preflight checklist

Run the automated checklist before promoting the managed Postgres
cluster. It validates both databases, ensures migrations are applied and
forces an explicit acknowledgement that operational guardrails are in
place:

```bash
backend/venv/bin/python scripts/preflight_db_migration.py \
  --sqlite-path /var/backups/revenuepilot.sqlite \
  --postgres-url "$DATABASE_URL" \
  --aws-rds-ca-path /etc/ssl/certs/rds-combined-ca-bundle.pem \
  --confirm-backups \
  --confirm-maintenance-window \
  --confirm-alerting
```

The script opens the SQLite database read-only, executes `SELECT 1`
against Postgres (injecting the AWS RDS CA bundle when provided) and
reports any Alembic revisions missing from the target database before
exiting. Passing the confirmation flags tells CI/CD that RDS backups
(automated snapshots plus a manual pre-cutover snapshot), the migration
maintenance window and alerting/on-call integrations are all ready.
Wire the command into the deployment pipeline immediately before the
cutover step so failures halt the release while there is still time to
correct course.【F:scripts/preflight_db_migration.py†L1-L202】


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
  encounter, with server-side versions tracked through the notes API.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L1604-L1648】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L800-L870】【F:backend/main.py†L7970-L8046】
- **Templates and snippets** – Base templates load from the backend with
  offline fallbacks and CRUD actions for user-defined templates. Templates
  can be filtered by specialty and payer context before being inserted
  into the editor.【F:revenuepilot-frontend/src/components/RichTextEditor.tsx†L400-L441】【F:backend/templates.py†L1-L160】
- **Suggestion panel** – Categorised AI suggestions (codes, compliance,
  public health, differentials, follow-up) respond to note edits,
  specialty and payer selections, and now consume live websocket streams
  with connection-aware badges before falling back to REST when
  offline.【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1360-L1648】【F:revenuepilot-frontend/src/components/SuggestionPanel.tsx†L36-L132】【F:revenuepilot-frontend/src/components/SuggestionPanel.tsx†L620-L972】【F:backend/main.py†L11348-L12124】
- **Transcription tools** – Optional visit recording captures diarised
  transcripts and merges segments into the note. The backend supports
  Whisper, local models and offline fallbacks.【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1000-L1099】【F:backend/audio_processing.py†L1-L200】

### Finalisation workflow

- **Session orchestration** – Launch the workflow from the toolbar or
  sidebar, persist the current draft context and return clinicians to
  their previous view after finishing finalisation.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L785-L820】【F:revenuepilot-frontend/src/ProtectedApp.tsx†L1661-L1670】
- **Validation & attestation panels** – Trigger note validation, review
  reimbursement details, record attestation metadata and monitor dispatch
  results without leaving the workspace.【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L1320-L1556】【F:revenuepilot-frontend/src/features/finalization/WorkflowWizard.tsx†L540-L624】
- **Live coding stream awareness** – The finalization wizard surfaces
  websocket status badges, reuses streaming suggestions when available
  and only hits REST fallbacks when streams are offline.【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L69-L118】【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L832-L1140】【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L1600-L1652】


### Administrative & operational views

- **Dashboard** – Admin-only charts summarise baseline vs current usage,
  revenue metrics and denial rates, with export to PDF support. Filter
  controls persist per user, letting analysts scope analytics by date
  presets or custom ranges alongside clinician, clinic and payer
  selections that flow through to the backend query parameters.【F:revenuepilot-frontend/src/components/Analytics.tsx†L185-L314】【F:backend/main.py†L9206-L9706】
- **Audit & activity logs** – Recent events stream from `/events` while
  structured audit entries are available under `/api/activity/log`.【F:revenuepilot-frontend/src/components/ActivityLog.tsx†L1-L156】【F:revenuepilot-frontend/src/hooks/useActivityLog.ts†L241-L276】
- **Configuration & preferences** – Clinician settings, API keys, EHR integration,
  organisation metadata and security controls are administered through the
  workspace settings view with optimistic backend persistence.【F:revenuepilot-frontend/src/components/Settings.tsx†L1254-L1412】
- **Notifications** – Persistent notifications, unread counts and quick actions
  are surfaced in the shell and backed by `/api/notifications` endpoints and
  websocket updates.【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L388-L520】【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L763-L819】
- **Scheduling** – The schedule view combines follow-up recommendations with
  appointment creation, exports and bulk status updates backed by the scheduling module.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L600-L653】【F:backend/scheduling.py†L500-L980】

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

- **Authentication context** – JWT access and refresh tokens persist in
  storage with automatic refresh and logout handled by the auth provider
  and API helpers.【F:revenuepilot-frontend/src/contexts/AuthContext.tsx†L1-L120】【F:revenuepilot-frontend/src/lib/api.ts†L1-L120】
- **Session synchronisation** – Layout preferences, selected codes and
  finalisation data hydrate from the backend and are persisted with
  throttled updates as clinicians work.【F:revenuepilot-frontend/src/contexts/SessionContext.tsx†L294-L438】
- **API utilities** – Shared fetch helpers resolve the API base URL,
  attach credentials, manage refresh tokens and construct websocket URLs
  for real-time features.【F:revenuepilot-frontend/src/lib/api.ts†L180-L268】

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
- `DATABASE_URL`, `SQLITE_DSN`, `POSTGRES_*`, `PGSSLMODE`, `PGCONNECT_TIMEOUT`,
  `PGSSLROOTCERT`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `STATEMENT_TIMEOUT_MS`,
  `JWT_SECRET`, `JWT_SECRET_ROTATED_AT`, `METRICS_LOOKBACK_DAYS` – Backend
  database configuration, token signing secret with rotation metadata, and
  analytics retention window.【F:backend/main.py†L600-L760】
- `SECRETS_BACKEND`, `SECRETS_FALLBACK`, `SECRET_MAX_AGE_DAYS` – Control
  whether secrets are loaded from environment managers only or allow the
  encrypted local fallback, and configure stale-secret enforcement.
- `SECRETS_PREFIX`, `AWS_REGION`, `VAULT_ADDR`, `VAULT_TOKEN`,
  `VAULT_NAMESPACE`, `VAULT_MOUNT`, `VAULT_BASE_PATH` – Configure the
  external secrets backend described below.【F:backend/key_manager.py†L85-L380】

#### Database connection precedence

The backend resolves its SQLAlchemy engine configuration in the following
order:

1. **Explicit DSN** – When `DATABASE_URL` is provided, it is used exactly
   as supplied.
2. **Component variables** – If `POSTGRES_HOST` (and related
   `POSTGRES_*` settings) are present, the backend assembles a PostgreSQL
   DSN using those values plus optional TLS overrides such as
   `PGSSLMODE`, `PGSSLROOTCERT` and connection timeouts from
   `PGCONNECT_TIMEOUT`.
3. **SQLite fallback** – In the absence of the above, the application
   falls back to `SQLITE_DSN`, which defaults to the local development
   SQLite file.

`DB_POOL_SIZE`, `DB_MAX_OVERFLOW` and `STATEMENT_TIMEOUT_MS` tune the
connection pool while `PGSSLROOTCERT` can point at an AWS RDS combined CA
bundle when TLS verification is required. Treat `POSTGRES_PASSWORD` and
other secrets as production credentials that must be injected at runtime
via a secrets manager (AWS Secrets Manager, SSM Parameter Store, Vault,
etc.) rather than committed to `.env` files or source control.

### Secrets management

Production deployments must declare `SECRETS_BACKEND` to point at the
authoritative store. Supported options are:

- `aws` – Use AWS Secrets Manager. Set `AWS_REGION`/`AWS_DEFAULT_REGION`
  and optionally `SECRETS_PREFIX` (e.g. `RevenuePilot/{name}`) to control
  the secret naming scheme. Secrets are stored as JSON payloads of the
  form:

  ```json
  {
    "value": "<secret string>",
    "metadata": {
      "rotatedAt": "2024-01-15T00:00:00Z",
      "version": "v3",
      "expiresAt": "2024-04-15T00:00:00Z",
      "source": "aws-secrets-manager"
    }
  }
  ```

  The helper automatically records the AWS version identifier and writes
  fresh rotation timestamps when secrets are rotated via the API.

- `vault` – Use HashiCorp Vault KV v2. Provide `VAULT_ADDR`,
  `VAULT_TOKEN` and optionally `VAULT_NAMESPACE`. Secrets are stored at
  `VAULT_MOUNT`/`VAULT_BASE_PATH/<name>` (override with
  `VAULT_SECRET_TEMPLATE`) using the same JSON structure as above. The
  KV metadata is mirrored into the local rotation ledger.

- `env` – Treat process environment variables as read-only. Use this for
  platforms that inject secrets at runtime; writing back is not
  supported.

Rotation metadata is mandatory outside development. Each secret should
include:

- `rotatedAt` – ISO-8601 timestamp in UTC.
- `version` – Unique identifier for auditability (the backend will
  generate a UUID if omitted).
- `expiresAt` – Optional ISO-8601 timestamp matching your rotation
  policy.
- `source` – Human-readable description of the store (e.g.
  `aws-secrets-manager`, `vault`).

`backend/key_manager.py` persists the metadata locally for auditing and
enforces freshness using `SECRET_MAX_AGE_DAYS`. The `start` scripts abort
in non-development environments when secrets are missing or stale so the
deployment pipeline can surface actionable errors.【F:backend/key_manager.py†L85-L520】【F:start.sh†L1-L64】【F:start.ps1†L1-L64】

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

## Monitoring and observability

The backend now emits JSON structured logs via `structlog`, automatically
including a per-request trace identifier propagated through the
`X-Trace-Id` header for correlation with frontend events. Prometheus
metrics are exposed from FastAPI at `/metrics`; request the endpoint with
`format=prometheus` or an `Accept: text/plain` header to retrieve scrape-
ready output containing request/latency histograms and business counters
for workflow completions, AI failures and EHR export issues. An
aggregated operational summary is available at `/status/alerts` and is
surfaced on the admin dashboard for quick triage. Deployment pipelines
should configure log shipping to handle JSON payloads and register the
Prometheus endpoint with the monitoring stack.【F:backend/main.py†L231-L362】【F:revenuepilot-frontend/src/components/Dashboard.tsx†L1-L192】

Production deployments should source `OPENAI_API_KEY`, `JWT_SECRET` and
other credentials from an external secrets manager (AWS Secrets Manager,
Vault, etc.) and provide the corresponding rotation metadata so the
backend can enforce policies. Hosted environments should set
`SECRETS_BACKEND` to the chosen integration (`aws`, `vault` or `env` for
platform-provided variables) and leave `SECRETS_FALLBACK=never`; the
development scripts only provision local fallbacks when `ENVIRONMENT` is
a development value.【F:backend/key_manager.py†L85-L520】【F:start.sh†L1-L64】


### Post-migration monitoring and audit trails

After the switchover, monitor `pg_stat_activity` to verify connection
patterns and spot idle-in-transaction sessions that would hold locks.
Pair it with the provider’s connection pool metrics (e.g. RDS
`DatabaseConnections`, `MaximumUsedTransactionIDs`) and alerts when
either approaches configured `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` ceilings.
Collect statement timeout events by enabling Postgres `log_min_duration_statement`
or CloudWatch/RDS performance insights so slow queries and cancelled
statements triggered by `STATEMENT_TIMEOUT_MS` are visible to operators.

For HIPAA-aligned auditing, stream the `audit_log` table to a write-once
store or SIEM, retaining username, IP address, user agent and success
metadata captured by the backend whenever a privileged action occurs.
Set `SIEM_WEBHOOK_URL` (and optionally `SIEM_WEBHOOK_TIMEOUT`) to have
the backend forward each audit event to an external collector after the
database write succeeds. Admins can also retrieve the audit history
through the `/audit` endpoint exposed by the FastAPI service.【F:backend/main.py†L2287-L2388】【F:backend/main.py†L4492-L4519】

### Production database expectations

RevenuePilot runs on Amazon RDS for PostgreSQL in production. Follow the
[`Production Database & RDS Operations`](RDS_OPERATIONS.md) guide for full
details and enforce the following controls:

- **Provisioning & backups** – Enable storage encryption with a KMS CMK,
  require TLS (`rds.force_ssl = 1`) using the `rds-ca-rsa2048-g1` bundle,
  and keep automated backups for at least 7 days alongside manual snapshots
  before migrations.
- **Networking & logging** – Deploy the cluster in private subnets, narrow
  security group ingress to application hosts, emit PostgreSQL logs to
  CloudWatch, and monitor RDS and CloudTrail events for configuration
  changes.
- **Database roles** – Use a privileged `migration` role for Alembic DDL and
  a constrained `app_user` role for application traffic. Rotate both via AWS
  Secrets Manager or Parameter Store and retrieve them at runtime without
  printing credentials.
- **Runtime configuration** – Configure TLS and pooling via environment
  variables such as `PGSSLROOTCERT`, `PGSSLMODE=verify-full`,
  `PGCONNECT_TIMEOUT`, `DB_POOL_SIZE`, and `DB_STATEMENT_TIMEOUT_MS` tuned
  for RDS.
- **Migration runbook** – Snapshot before changes, run the Alembic upgrade
  with the `migration` user, validate row counts, execute smoke tests, and
  be ready to downgrade or restore if anomalies appear.



## Additional references

- [ARCHITECTURE.md](ARCHITECTURE.md) – Deep dive into module
  responsibilities and data flow.
- [LOCAL_MODELS.md](LOCAL_MODELS.md) – Offline/edge model setup.
- [PROMPT_TEMPLATES.md](PROMPT_TEMPLATES.md) – Customising prompt
  instructions.
- [finalization_workflow_regression.md](finalization_workflow_regression.md) –
  Step-by-step API regression guide.
- [SOP.md](SOP.md) – Day-to-day development process and CI expectations.
- [RDS_OPERATIONS.md](RDS_OPERATIONS.md) – Production database provisioning,
  credential rotation, and migration runbook.
- [RUNBOOK_KEY_ROTATION.md](RUNBOOK_KEY_ROTATION.md) – Broken-glass steps for
  encrypting artifacts/AI payloads and rotating managed secrets safely.
- [`docs/archive/`](archive/README.md) – Historical planning documents kept
  for context.

This handbook should be treated as the single source of truth; update it
whenever behaviour or tooling changes.
