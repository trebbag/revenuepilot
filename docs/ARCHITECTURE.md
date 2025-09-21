# RevenuePilot Architecture Overview

This document explains how the RevenuePilot application fits together. It
is a companion to the handbook and should be used when making structural
changes or onboarding new contributors.

## Frontend (React / Vite)

The production UI lives under `src/` and is also exposed via the
`revenuepilot-frontend` workspace for isolated Vite development.

### Application shell

- **`App.jsx`** orchestrates authentication, view routing and the main
  layout. It coordinates the draft/beautified editor tabs, the
  suggestion panel, dashboard, logs, settings, drafts, admin, scheduler,
  notifications and help views.【F:src/App.jsx†L1-L180】【F:src/App.jsx†L236-L360】
- **`Sidebar.jsx`** exposes navigation with persisted collapse state and
  unread notification badges supplied by the backend.【F:src/components/Sidebar.jsx†L1-L200】
- **`Login.jsx`** issues registration/login requests, stores JWT access
  and refresh tokens and kicks off refresh flows via `api.js`. It also
  renders MFA prompts when configured.【F:src/components/Login.jsx†L1-L200】【F:src/api.js†L320-L520】

### Clinical workspace

- **`NoteEditor.jsx`** wraps ReactQuill with custom toolbars, patient &
  encounter fields, chart upload helpers, transcription controls and
  template insertion. It surfaces auto-save state and delegates AI
  actions to callbacks provided by `App.jsx`. When a visit session is
  active it also attaches resilient websocket listeners for
  transcription, compliance, coding and collaboration channels so that
  interim transcripts, streaming alerts and presence indicators stay in
  sync with the clinician’s workspace.【F:src/components/NoteEditor.jsx†L620-L930】【F:src/components/NoteEditor.jsx†L1320-L2050】
- **`SuggestionPanel.jsx`** renders expandable cards for codes,
  compliance, public health, differentials and follow-up. It debounces
  backend calls, respects specialty/payer filters and exports follow-up
  events via the scheduling API.【F:src/components/SuggestionPanel.jsx†L1-L160】
- **`TranscriptView.jsx`** displays diarised transcript segments,
  allowing clinicians to insert speaker-labelled snippets into the
  draft. It highlights transcription errors surfaced by the backend.【F:src/components/TranscriptView.jsx†L1-L200】
- **`TemplatesModal.jsx`** manages reusable note templates and persists
  CRUD operations through the templates API, caching results offline when
  possible.【F:src/components/TemplatesModal.jsx†L1-L200】【F:src/api.js†L1-L170】

### Administrative tooling

- **`Dashboard.jsx`** fetches baseline/current metrics, renders Chart.js
  visualisations and offers PDF exports. The component gates access to
  admin users by decoding the JWT role claim.【F:src/components/Dashboard.jsx†L1-L120】
- **`Logs.jsx`** streams recent events and audit entries from the backend
  for troubleshooting.【F:src/components/Logs.jsx†L1-L120】
- **`AdminUsers.jsx`** lets administrators invite, update and deactivate
  accounts and shows the audit log component inline.【F:src/components/AdminUsers.jsx†L1-L120】
- **`Notifications.jsx`** lists notification events, unread counts and
  quick actions sourced from `/api/notifications/*` endpoints.【F:src/components/Notifications.jsx†L1-L200】
- **`Scheduler.tsx`** manages follow-up recommendations, appointment CRUD,
  ICS exports and bulk actions against the scheduling API.【F:src/components/Scheduler.tsx†L1-L260】【F:backend/scheduling.py†L500-L980】

### Infrastructure helpers

- **`api.js`** centralises HTTP calls, offline caching and the retry
  queue. It resolves the backend base URL, attaches JWTs, refreshes
  tokens and replays queued mutations when connectivity returns. The
  module also exposes websocket helpers with automatic reconnection for
  notifications, transcription, compliance, coding and collaboration
  channels.【F:src/api.js†L1760-L2040】
- **`context/` & `hooks/`** contain React context providers for settings,
  notifications and analytics as well as custom hooks for polling and
  keyboard shortcuts.【F:src/context/SettingsContext.jsx†L1-L160】
- **Internationalisation** is configured via `i18n.js` with translation
  bundles in `src/locales/`. Keys align with the backend prompt language
  fields and user preferences.【F:src/i18n.js†L1-L120】【F:backend/main.py†L4239-L4333】

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
