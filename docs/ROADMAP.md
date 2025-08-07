# RevenuePilot Roadmap

This roadmap reflects the outstanding bugs, missing features and future enhancements discussed in the planning chats.  Each item is grouped by priority (P0–P2).  P0 items are blockers that should be tackled before new feature work; P1 items are important but not immediately blocking; P2 items are nice‑to‑haves or longer‑term goals.

**Status:** Speech‑to‑Text & Diarisation – 100% complete. Advanced PHI Scrubbing – 100% complete. User settings persistence – 100% complete. Refined Prompts – 100% complete.

## P0 – Blockers

- **Analytics Visualisation:** Expand `Dashboard.jsx` to render time‑series charts for each metric using Chart.js or Recharts.  Enhance `/metrics` to return aggregated data by day/week.
- **Test Coverage:** Establish unit and integration tests for both backend and frontend.  Cover all endpoints, UI flows and edge cases.  Integrate `pytest`, `pytest‑asyncio`, `pytest‑cov` and React Testing Library.

## P1 – Important Enhancements

- **EHR Integration:** Initial FHIR export workflow is in place. The `/export` API and matching UI button post the final note and selected billing codes to a configured FHIR server. Future work can expand resource coverage and vendor‑specific workflows.
- **User Settings & Preferences:** Persist user settings (theme, enabled suggestion categories, custom rules) in a database so that they travel with the user rather than being stored solely in the browser.
- **Internationalisation:** Add support for multiple locales and languages in the UI and prompts, starting with Spanish.

## P2 – Longer‑Term / Nice‑to‑Haves

- **Specialty Templates and Workflows:** Add note templates for paediatrics, geriatrics, psychiatry and other specialties.  Allow clinics to define their own templates.
- **Smart Suggestions for Public Health:** Public health guidance is pulled from CDC and WHO APIs via `backend/public_health.py`.  The `/suggest` endpoint accepts optional `age`, `sex`, `region` and `agencies` fields and returns a `publicHealth` array with recommendations, source agency and evidence level.  Results are cached in memory using the `GUIDELINE_CACHE_TTL` environment variable and are keyed by region and selected agencies.  Region‑specific endpoints can be provided by setting `CDC_GUIDELINES_URL` or `WHO_GUIDELINES_URL` to either JSON mappings or `REGION:url` pairs.  Users can choose which agencies to consult and specify their region in Settings.
- **Offline Mode:** Investigate offline LLM inference for beautification and suggestions to avoid network dependence.
- **AI‑Driven Scheduling:** Suggest follow‑up appointment intervals and automatically populate a calendar based on recommended care plans.

## Metrics Schema

The analytics dashboard draws from a SQLite events table.  Key metrics include
`revenue_projection`, `revenue_per_visit`, `avg_time_to_close`, `denial_rate`
and counts of compliance flags.  Results are aggregated by day and week and
returned under a `timeseries` key for charting.  Set the environment variable
`METRICS_LOOKBACK_DAYS` (default 30) to limit how many days of events are kept
for calculations.

## Localisation Guidelines

- Store translations under `src/locales/` with one JSON file per language. The English file (`en.json`) acts as the reference; other locales must mirror its keys.
- Register new languages in `src/i18n.js` and update tests to include the new locale file.
- Use `t('namespace.key')` from `react-i18next` for all user-facing strings. Group keys logically (e.g., `settings.saveButton`, `dashboard.revenueChart`).
- For pluralisation, use i18next's plural forms (`key_one`, `key_other`) and call `t('key', { count })`.
- Run `npm test` to ensure the locale key coverage test passes after adding or modifying translation files.
