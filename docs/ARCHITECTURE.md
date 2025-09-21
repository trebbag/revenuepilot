# RevenuePilot Architecture Overview

This document explains how the RevenuePilot application fits together. It
is a companion to the handbook and should be used when making structural
changes or onboarding new contributors.

## Frontend (TypeScript / Vite workspace)

The canonical React codebase lives in `revenuepilot-frontend/src/`. The
root `package.json` treats the Vite project as a workspace, builds it for
Electron and copies the bundled assets into `electron/dist/` before
packaging.【F:package.json†L1-L26】【F:scripts/sync-frontend-build.js†L7-L20】【F:electron/main.js†L273-L312】

### Application shell

- **`App.tsx`** wraps the entire UI in authentication and session
  providers. It blocks access while tokens are refreshed or the persisted
  workspace layout is loading, then hands off to the protected shell once
  user and session state are hydrated.【F:revenuepilot-frontend/src/App.tsx†L1-L69】
- **`ProtectedApp.tsx`** coordinates navigation and workspace layout. It
  manages view state, selected code context, note editor content, the
  finalisation workflow launcher and schedule pre-population while
  gating protected views by permission.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L1-L195】【F:revenuepilot-frontend/src/ProtectedApp.tsx†L128-L205】
- **`NavigationSidebar.tsx`** loads the current view, notification feed,
  user profile and UI preferences from the backend, persists updates and
  maintains websocket connections for live notification badges.【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L388-L520】【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L763-L819】
- **`SessionContext.tsx`** hydrates layout preferences and selected code
  state from `/api/user/session`, keeps local edits in sync with the
  server and persists layout changes back to the backend with throttled
  updates.【F:revenuepilot-frontend/src/contexts/SessionContext.tsx†L294-L438】

### Clinical workspace

- **`NoteEditor.tsx`** handles patient search, encounter validation,
  transcription streaming and note persistence. It debounces auto-save
  requests, validates encounters, streams audio to `/api/transcribe/stream`
  and polls AI compliance checks while updating the session context with
  new drafts.【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L800-L870】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1181-L1300】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1000-L1099】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1500-L1602】
- **`SuggestionPanel.tsx`** requests code, compliance, prevention and
  differential suggestions, debouncing note-content changes before
  calling the AI endpoints and normalising responses for the clinician to
  action.【F:revenuepilot-frontend/src/components/SuggestionPanel.tsx†L162-L352】
- **`SelectedCodesBar.tsx`** aggregates selected items, hydrates billing
  and documentation insights, validates combinations and surfaces payer
  warnings by querying the batching, billing and documentation APIs for
  the active code set.【F:revenuepilot-frontend/src/components/SelectedCodesBar.tsx†L204-L373】
- **`FinalizationWizardAdapter.tsx`** bridges the note view and finalised
  workflow by translating session state into the wizard contract, running
  pre-finalisation checks and posting `/api/notes/finalize` requests while
  caching blocking issues and reimbursement summaries.【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L1433-L1479】

### Administrative & operational views

- **`Dashboard.tsx`** loads daily metrics, quick actions, activity and
  system status via dedicated APIs, surfaces loading/error states and
  provides manual refresh controls for administrators.【F:revenuepilot-frontend/src/components/Dashboard.tsx†L1-L192】
- **`Analytics.tsx`** drives usage, coding, revenue, compliance and draft
  analytics tabs by issuing parallel API calls, reconciling errors and
  feeding rich chart visualisations.【F:revenuepilot-frontend/src/components/Analytics.tsx†L885-L938】
- **`Settings.tsx`** merges clinician preferences with administrative
  configuration. It loads and persists user settings, EHR integration,
  organisation metadata and security controls through the corresponding
  REST endpoints with optimistic updates.【F:revenuepilot-frontend/src/components/Settings.tsx†L1254-L1412】

### Infrastructure helpers

- **`lib/api.ts`** stores tokens, resolves the API base URL, transparently
  refreshes credentials and exposes helpers for authenticated fetches and
  websocket URL construction used throughout the workspace.【F:revenuepilot-frontend/src/lib/api.ts†L1-L120】【F:revenuepilot-frontend/src/lib/api.ts†L180-L268】
- **`contexts/` & `hooks/`** encapsulate shared session, auth and
  analytics logic so that components consume consistent state and retry
  semantics across the workspace.【F:revenuepilot-frontend/src/contexts/AuthContext.tsx†L1-L120】【F:revenuepilot-frontend/src/contexts/SessionContext.tsx†L274-L359】
- **Internationalisation** is handled through the localisation helpers in
  the workspace, mirroring the backend language preferences so prompts
  and UI copy align with server-configured locales.【F:revenuepilot-frontend/src/contexts/SessionContext.tsx†L294-L324】【F:backend/main.py†L4239-L4333】

## Backend (FastAPI)

The backend lives in `backend/` and exposes both REST and WebSocket
interfaces. `backend/main.py` ties together the modules listed below.

### Authentication & authorisation

- **JWT issuance** – `/register` and `/login` return access and refresh
  tokens signed with `JWT_SECRET`. Refresh tokens can be rotated via
  `/refresh` and logout revokes them from the database.【F:backend/main.py†L3187-L4035】
- **Role enforcement** – `require_role()` guards admin-only endpoints.
  MFA challenges, account lockouts and audit logging are handled in the
  auth workflow.【F:backend/main.py†L2784-L2905】【F:backend/auth.py†L1-L160】

### Note lifecycle & workflow

- **Draft management** – `/api/notes/create`, `/api/notes/auto-save` and
  `/api/notes/versions/{note_id}` persist draft content, track versions
  and expose auto-save status. Bulk operations support archival and
  search.【F:backend/main.py†L7970-L8060】【F:backend/main.py†L13393-L13580】
- **Finalisation workflow** – `/api/v1/workflow/*` endpoints drive the
  six-step attestation and dispatch process documented in
  `docs/finalization_workflow_regression.md`. State persists in the
  `shared_workflow_sessions` tables and surfaces code selections,
  compliance issues and billing summaries.【F:backend/main.py†L10374-L11270】

### AI orchestration & clinical intelligence

- **Beautify/Suggest/Summarise** – REST and WebSocket endpoints call
  `openai_client.call_openai`, merge prompt templates and run
  de-identification before hitting the AI provider. Offline and local
  model modes emit deterministic fallbacks.【F:backend/main.py†L9755-L12084】【F:backend/deid.py†L1-L200】
- **Compliance & coding** – Endpoints under `/api/ai/compliance.*`,
  `/api/ai/codes.*` and `/api/compliance/*` manage rule catalogues,
  issue-tracking and websocket monitors. Rule seeds live in
  `compliance.py` and `code_tables.py`.【F:backend/main.py†L11348-L11972】【F:backend/compliance.py†L1-L320】
- **Public health & scheduling** – `public_health.py` fetches guidance
  while `scheduling.py` determines follow-up intervals and exports ICS
  data. Both feed the suggestion panel and scheduling UI.【F:backend/public_health.py†L1-L240】【F:backend/scheduling.py†L1-L240】
- **Transcription** – `audio_processing.py` provides synchronous
  Whisper-based transcription and diarisation with optional
  `pyannote.audio`. `/transcribe` supports file uploads and websockets for
  live streaming.【F:backend/audio_processing.py†L1-L240】【F:backend/main.py†L9651-L9716】

### Data management & integrations

- **Migrations & seeding** – `migrations.py` creates tables for users,
  settings, templates, sessions, analytics, notifications, codes and
  payer schedules. `_seed_reference_data` populates CPT/ICD/HCPCS and
  compliance datasets on startup.【F:backend/migrations.py†L1-L360】【F:backend/main.py†L1205-L1375】
- **Analytics** – Events land in SQLite tables via `/api/activity/log`
  and `/event`. Aggregations feed `/metrics`, `/api/analytics/*` and the
  admin dashboard charts.【F:backend/main.py†L7664-L9256】
- **FHIR export** – `/api/export/ehr` assembles transaction bundles using
  `ehr_integration.py`. OAuth2 credentials are cached, with basic/bearer
  fallbacks. Export jobs are tracked in `exports` tables.【F:backend/main.py†L8141-L8198】【F:backend/ehr_integration.py†L1-L240】
- **Key management** – `/apikey` writes the OpenAI key through
  `key_manager.py`, storing metadata and supporting multi-service keys.
  Keys may also be injected via environment variables.【F:backend/key_manager.py†L1-L200】【F:backend/main.py†L9716-L9738】

## Data flow

1. **User session** – The clinician registers/logs in, obtaining JWTs and
   persisted settings. The sidebar loads notifications and layout prefs
   from `/api/user/*` endpoints.【F:backend/main.py†L4239-L4473】
2. **Drafting** – `NoteEditor` tracks patient and encounter IDs, performs
   client-side caching and posts to `/api/notes/*` for auto-save and
   versioning.【F:src/components/NoteEditor.jsx†L80-L160】【F:backend/main.py†L7970-L8046】
3. **AI interactions** – Beautify/suggest/summarise requests travel
   through `api.js`, hit FastAPI where text is de-identified, prompts are
   assembled and responses logged for analytics.【F:src/api.js†L520-L760】【F:backend/main.py†L9755-L12084】
 4. **Compliance & workflow** – Compliance issues and selected codes feed
   into the workflow APIs, culminating in finalisation and optional FHIR
   export.【F:backend/main.py†L10374-L11270】
 5. **Analytics & notifications** – Events from actions above populate the
   `events`, `event_aggregates`, `notifications` and `audit_log` tables.
   Admin views pull from these tables to render dashboards, logs and
   alerts.【F:backend/main.py†L7536-L8912】
  6. **Live visit telemetry** – Active visit sessions open websocket
     channels for `/ws/transcription`, `/ws/compliance`, `/ws/codes` and
     `/ws/collaboration`. `api.js` tracks the reconnection state and
     resumes from the last `eventId`, while `NoteEditor` merges interim
     transcripts, streaming compliance alerts, code suggestions and
     collaborator presence into the existing UI without interrupting the
     draft.【F:src/api.js†L1804-L2015】【F:src/components/NoteEditor.jsx†L860-L1110】

## External services & configuration

- **OpenAI / local models** – `openai_client.py` decides between
  deterministic offline responses, llama.cpp local inference or remote
  OpenAI calls based on environment flags.【F:backend/openai_client.py†L1-L117】
- **spaCy & de-identification engines** – `install.sh` installs the spaCy
  English model. Optional packages (Presidio, Philter) can be added to
  enhance de-identification via the `DEID_ENGINE` variable.【F:install.sh†L39-L55】【F:backend/deid.py†L1-L200】
- **Electron packaging** – The root `package.json` scripts orchestrate
  the build, fetch icons, copy backend resources and run
  `electron-builder`. Refer to `docs/DESKTOP_BUILD.md` for certificate
  requirements.【F:package.json†L11-L94】【F:docs/DESKTOP_BUILD.md†L1-L68】

This architecture should remain synchronised with code changes. Update it
whenever major modules or flows are introduced or retired.
