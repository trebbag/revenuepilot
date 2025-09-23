# RevenuePilot

RevenuePilot is a desktop-ready clinical documentation assistant that
combines a React note-taking workspace, a FastAPI backend, and an
Electron shell. Clinicians draft notes, receive AI-guided coding and
compliance support, review transcripts, manage templates, and export
finalized encounters while administrators monitor analytics, audit logs,
notifications, and scheduling data.

The React UI lives in the TypeScript workspace under
`revenuepilot-frontend/src/`. The root `package.json` builds that
workspace and copies the Vite output into the Electron bundle so the
desktop packaging pipeline always reflects the canonical source.【F:package.json†L1-L26】【F:scripts/sync-frontend-build.js†L7-L20】【F:electron/main.js†L273-L312】

## Highlights

- **End-to-end clinical workspace** with draft/beautified tabs, template
  management, chart uploads, visit transcription, clipboard export
  helpers, and auto-save per patient/encounter.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L1604-L1648】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L800-L870】
- **AI orchestration** for beautify, coding, compliance, public-health,
  differential, summarisation, follow-up, and FHIR export workflows with
  offline/local-model fallbacks.【F:backend/main.py†L9755-L12124】【F:backend/openai_client.py†L1-L117】
- **Administrative tooling** including dashboards, activity logs,
  configuration panels, notifications, scheduling, and workflow
  finalisation endpoints.【F:revenuepilot-frontend/src/components/Dashboard.tsx†L1-L192】【F:backend/main.py†L7536-L12239】
- **Staged chart ingestion** drives context awareness: Superficial (fast context), Deep (normalized facts with evidence anchors), and Indexed (embedding + lexical search). The UI and AI always use the richest available stage, show freshness, and degrade gracefully. Typical completion: Deep + Indexed within one hour; Superficial within a few minutes.【F:backend/context_pipeline.py†L1-L415】【F:backend/main.py†L13966-L14033】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L257-L356】
- **Packaging pipeline** that bundles the React build and FastAPI backend
  into signed Electron installers with optional auto-update hosting.【F:package.json†L11-L94】【F:docs/DESKTOP_BUILD.md†L1-L68】

## Getting started

1. **Install dependencies**
   ```bash
   ./install.sh        # macOS/Linux
   # or
   ./install.ps1       # Windows PowerShell
   ```
   The installer runs `npm install`, initialises the backend virtual
   environment (`backend/venv`) and installs Python requirements plus
   spaCy’s English model.【F:install.sh†L1-L55】

2. **Launch the stack**
   ```bash
   ./start.sh          # macOS/Linux
   # or
   ./start.ps1         # Windows PowerShell
   ```
   This starts `uvicorn backend.main:app --reload --port 8000` and the
   Vite dev server with `VITE_API_URL` set automatically. Stop the
   frontend to terminate the backend.【F:start.sh†L1-L32】

3. **Create an account** – Open the frontend (default
   `http://localhost:5173`) and register your first user. JWT access and
   refresh tokens are issued immediately so you can explore the note
   workspace, suggestions, templates, analytics and admin tooling.【F:backend/main.py†L3187-L3240】

### Testing & quality

Execute the primary checks from the project root:

```bash
backend/venv/bin/pytest          # Backend regression & workflow tests
npm run test:coverage            # Frontend unit tests & coverage
npm run test:e2e                 # Playwright smoke tests
```

These match the CI workflow (`ci.sh`) which also enforces ESLint/Prettier
formatting.【F:package.json†L13-L36】【F:ci.sh†L1-L80】

### Documentation

Comprehensive documentation now lives in [`docs/README.md`](docs/README.md),
which links to the architecture guide, offline model setup, prompt
customisation, desktop packaging, API regression playbooks, and the new
[`Production Database & RDS Operations`](docs/RDS_OPERATIONS.md) guide.
Historical planning material has been archived under
[`docs/archive/`](docs/archive).

### Production database expectations

RevenuePilot targets Amazon RDS for PostgreSQL in production. Follow the
[`RDS operations guide`](docs/RDS_OPERATIONS.md) for detailed instructions,
with the following highlights:

- **Provisioning** – Create Multi-AZ instances with storage encryption,
  automated backups (≥7 days), TLS enforced via `rds-ca-rsa2048-g1`, and
  CloudWatch log exports for PostgreSQL error/slow logs.
- **Networking** – Place instances in private subnets, restrict security
  groups to the application tier, and stream CloudTrail plus RDS events for
  auditing.
- **Credentials** – Maintain separate `migration` (DDL) and `app_user`
  (DML) roles, rotate passwords through AWS Secrets Manager or Parameter
  Store, and retrieve secrets at runtime without echoing them to logs.
- **Runtime config** – Set TLS and pooling environment variables such as
  `PGSSLROOTCERT`, `PGSSLMODE=verify-full`, `PGCONNECT_TIMEOUT`, pool sizes,
  and statement timeouts tuned for RDS defaults.
- **Runbook** – Before every migration capture a snapshot, execute the
  Alembic upgrade with the `migration` role, validate row counts, run smoke
  tests, and be prepared to downgrade or restore from backups if
  verification fails.
