# RevenuePilot Backend Data Integration Status

This report summarises the current state of backend integrations for the
TypeScript workspace under `revenuepilot-frontend/src/`. Every section
below references the production modules and the API contracts they call so
that contributors can quickly confirm behaviour or extend the flows.

## Shell & navigation

- **Navigation sidebar** loads the persisted view, notification feed,
  profile metadata and UI preferences at start-up. Subsequent updates are
  posted back to the backend and live notification badges are refreshed
  via the `/ws/notifications` websocket with HTTP polling fallbacks.【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L388-L520】【F:revenuepilot-frontend/src/components/NavigationSidebar.tsx†L763-L819】
- **Session context** hydrates selected codes, layout proportions and
  stored finalisation sessions from `/api/user/session` and
  `/api/user/layout-preferences`. Layout changes are throttled and pushed
  back to the server whenever clinicians resize panels or toggle the
  suggestion drawer.【F:revenuepilot-frontend/src/contexts/SessionContext.tsx†L294-L438】

## Clinical documentation workspace

- **Note editor** orchestrates note persistence, patient search,
  encounter validation, live transcription and compliance checks. It
  creates notes via `/api/notes/create`, auto-saves through
  `/api/notes/auto-save`, validates encounters with
  `/api/encounters/validate`, debounces compliance requests to
  `/api/ai/compliance/check` and streams audio to
  `/api/transcribe/stream`. Patient search calls
  `/api/patients/search`, with external sources merged into the results.【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L724-L880】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1181-L1300】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1000-L1099】【F:revenuepilot-frontend/src/components/NoteEditor.tsx†L1500-L1602】
- **Rich text editor & templates** fetch reusable note templates from
  `/api/templates/list`, fall back to bundled defaults if the request
  fails and expose note version history by calling
  `/api/notes/versions/{noteId}`.【F:revenuepilot-frontend/src/components/RichTextEditor.tsx†L400-L456】
- **Suggestion panel** issues parallel POST requests to
  `/api/ai/codes/suggest`, `/api/ai/compliance/check`,
  `/api/ai/differentials/generate` and `/api/ai/prevention/suggest` every
  time the note content changes, merging the responses with existing
  selections and exposing quick actions for clinicians.【F:revenuepilot-frontend/src/components/SuggestionPanel.tsx†L162-L352】
- **Selected codes bar** hydrates detail records, billing estimates,
  combination validation and documentation requirements by calling
  `/api/codes/details/batch`, `/api/billing/calculate`,
  `/api/codes/validate/combination` and `/api/codes/documentation/{code}`.
  Categorisation rules are loaded from `/api/codes/categorization/rules`
  and merged with clinician overrides.【F:revenuepilot-frontend/src/components/SelectedCodesBar.tsx†L181-L373】

## Finalisation workflow

- **Wizard launcher** in the protected shell stores the current view,
  opens the finalisation overlay and restores the clinician to their
  previous workspace once the workflow closes.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L785-L820】【F:revenuepilot-frontend/src/ProtectedApp.tsx†L1661-L1670】
- **Finalisation wizard adapter** normalises session codes and compliance
  issues, runs pre-finalisation checks and posts `/api/notes/finalize`
  requests. Responses update the cached session snapshot so blocking
  issues, reimbursement summaries and compliance alerts persist across
  refreshes.【F:revenuepilot-frontend/src/components/FinalizationWizardAdapter.tsx†L1433-L1479】

## Administrative & analytics views

- **Dashboard** aggregates `/api/dashboard/daily-overview`,
  `/api/dashboard/quick-actions`, `/api/dashboard/activity` and
  `/api/system/status`, handling partial failures and exposing manual
  refresh controls.【F:revenuepilot-frontend/src/components/Dashboard.tsx†L1-L192】
- **Analytics** fetches usage, coding, revenue, compliance and draft
  analytics in parallel from `/api/analytics/usage`,
  `/api/analytics/coding-accuracy`, `/api/analytics/revenue`,
  `/api/analytics/compliance` and `/api/analytics/drafts`, reconciling
  retries and surfacing chart-ready payloads.【F:revenuepilot-frontend/src/components/Analytics.tsx†L885-L938】
- **Activity log** consumes `/api/activity/log` in pageable batches,
  categorising and deduplicating entries before presenting them in the UI.【F:revenuepilot-frontend/src/components/ActivityLog.tsx†L47-L158】【F:revenuepilot-frontend/src/hooks/useActivityLog.ts†L241-L276】
- **Settings** merges clinician preferences with administrative controls.
  It loads and persists `/api/user/preferences` for individual users while
  admin-only panels read and update `/api/integrations/ehr/config`,
  `/api/organization/settings` and `/api/security/config` with optimistic
  rollbacks on failure.【F:revenuepilot-frontend/src/components/Settings.tsx†L1254-L1412】
- **Scheduling** retrieves appointments and visit summaries from
  `/api/schedule/appointments`, transforms the payload into the clinical
  calendar model and pushes schedule actions back through the derived
  operations helpers.【F:revenuepilot-frontend/src/ProtectedApp.tsx†L600-L653】

## Platform services

- **Authentication** is centralised in `AuthContext`, which refreshes
  session state through `/api/auth/status`, stores tokens via the shared
  API helper and exposes logout flows that call `/api/auth/logout`. The
  `lib/api.ts` helper resolves the backend base URL, attaches credentials,
  persists refresh tokens when "remember me" is selected and builds
  websocket URLs for live features.【F:revenuepilot-frontend/src/contexts/AuthContext.tsx†L1-L120】【F:revenuepilot-frontend/src/lib/api.ts†L1-L120】【F:revenuepilot-frontend/src/lib/api.ts†L180-L268】

All major “NEEDS IMPLEMENTATION” placeholders in earlier drafts are now
resolved; the modules above document the live contracts used in the
production shell. Contributors can extend this list as new endpoints are
introduced.
