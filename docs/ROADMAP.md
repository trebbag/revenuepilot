# RevenuePilot Roadmap

This roadmap reflects the outstanding bugs, missing features and future enhancements discussed in the planning chats.  Each item is grouped by priority (P0–P2).  P0 items are blockers that should be tackled before new feature work; P1 items are important but not immediately blocking; P2 items are nice‑to‑haves or longer‑term goals.

**Status:** Speech‑to‑Text & Diarisation – 100% complete.

## P0 – Blockers

- **Advanced PHI Scrubbing:** Upgrade `backend/main.py`’s `deidentify` function to a ML‑based scrubber that detects names, dates and other PHI beyond simple regexes.  Consider integrating a library such as Philter.
- **Analytics Visualisation:** Expand `Dashboard.jsx` to render time‑series charts for each metric using Chart.js or Recharts.  Enhance `/metrics` to return aggregated data by day/week.
- **Test Coverage:** Establish unit and integration tests for both backend and frontend.  Cover all endpoints, UI flows and edge cases.  Integrate `pytest`, `pytest‑asyncio`, `pytest‑cov` and React Testing Library.

## P1 – Important Enhancements

- **EHR Integration:** Plan and implement FHIR POST of the final note and codes into supported EHRs.  Provide an optional backend integration layer for clinics that prefer direct insertion over copy‑paste.
- **User Settings & Preferences:** Persist user settings (theme, enabled suggestion categories, custom rules) in a database so that they travel with the user rather than being stored solely in the browser.
- **Internationalisation:** Add support for multiple locales and languages in the UI and prompts, starting with Spanish.
- **Refined Prompts:** Continuously improve prompt templates based on pilot feedback.  Allow dynamic prompt injection for different specialties and payers.

## P2 – Longer‑Term / Nice‑to‑Haves

- **Specialty Templates and Workflows:** Add note templates for paediatrics, geriatrics, psychiatry and other specialties.  Allow clinics to define their own templates.
- **Smart Suggestions for Public Health:** Integrate external guidelines to recommend region‑specific vaccinations, screenings and chronic disease management programmes.
- **Offline Mode:** Investigate offline LLM inference for beautification and suggestions to avoid network dependence.
- **AI‑Driven Scheduling:** Suggest follow‑up appointment intervals and automatically populate a calendar based on recommended care plans.
