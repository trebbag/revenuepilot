# RevenuePilot Roadmap

The current codebase ships a feature-complete pilot: clinicians can draft
notes with AI assistance, admins can manage users and analytics, and the
stack can be packaged as a desktop Electron app. The roadmap below
focuses on turning the pilot into a production-ready product.

## P0 – Production readiness

- **Harden persistence** – Replace the embedded SQLite connection with a
  managed Postgres instance, introduce connection pooling, migrations and
  automated backups. This unlocks true multi-user concurrency for the
  workflow and analytics tables that are currently initialised via
  `backend/migrations.py`.
- **Secrets & configuration** – Externalise secrets (JWT signing keys,
  service credentials) into a secrets manager and add rotation tooling.
  The existing `.env` prompts from `npm run setup-env` should be replaced
  with environment-based configuration in deployment manifests.
- **Observability** – Add structured logging, metrics export (Prometheus)
  and alerting for key endpoints such as `/api/v1/workflow/*`,
  `/api/ai/*`, `/api/export/ehr` and auth flows. Surface failures in the
  admin dashboard and include trace IDs in audit logs.

## P1 – Experience & scaling

- **Real-time collaboration** – Wire the existing websocket endpoints for
  transcription, compliance and code suggestions into the React app to
  support live updates when multiple users share an encounter.
- **Analytics deep dives** – Extend the dashboard with clinic, provider
  and payer filters using the aggregates exposed under
  `/api/analytics/*`. Allow scheduled PDF/email exports for leadership.
- **Template library** – Curate specialty/payer template packs and expose
  a marketplace view powered by the `templates` APIs, including tagging
  and version control.
- **Offline refinements** – Expand local model support beyond the current
  llama.cpp hook, add confidence calibration tests and ship an opt-in UI
  toggle for deterministic regression fixtures.

## P2 – Long-term investments

- **EHR connectors** – Build vendor-specific adapters on top of the FHIR
  export to push finalized notes, billing codes and attachments directly
  into popular EHRs.
- **Mobile companion** – Explore packaging the React app with Capacitor
  or React Native for on-the-go summary review and approval.
- **AI assurance** – Incorporate human-in-the-loop feedback loops,
  monitoring for drift and automated prompt evaluation harnesses.

## Quality gates

- Maintain 90%+ coverage across backend pytest and frontend Vitest suites
  while adding regression cases for every workflow change.
- Keep Playwright smoke tests green and expand them to cover scheduling,
  notifications and admin flows as new features land.
- Ensure documentation in [`docs/README.md`](README.md) and
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) is updated alongside code.
