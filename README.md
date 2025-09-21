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
customisation, desktop packaging, and API regression playbooks. Historical
planning material has been archived under [`docs/archive/`](docs/archive).
