# Developer Operating Procedure (SOP)

These guidelines keep collaboration predictable across the RevenuePilot
codebase. Follow them for every change, regardless of size.

## 1. Branching & commits

- Work in short-lived feature branches cut from `main` (e.g.
  `feat/workflow-audit`). Rebase frequently to stay current.
- Prefix commits with a concise summary (≤50 chars) followed by context
  in the body when helpful. Reference tests or tickets where applicable.
- Avoid force-pushing shared branches. If you must rewrite history,
  coordinate with collaborators first.

## 2. Environment setup

- Run the installer (`./install.sh` or `./install.ps1`) after pulling
  changes that touch dependencies. It provisions the Node workspace and
  refreshes the FastAPI virtualenv under `backend/venv`.
- Activate the backend environment with
  `source backend/venv/bin/activate` (macOS/Linux) or
  `backend\venv\Scripts\activate` (Windows) when running Python
  commands manually.
- Secrets are sourced from the secrets manager. `install`/`start` scripts
  provision mock JWT and OpenAI values for development, but production
  deployments must inject real secrets (and `*_ROTATED_AT` metadata)
  through the external store; never commit `.env` files.【F:install.sh†L1-L70】【F:start.sh†L1-L64】
- When `ENVIRONMENT` is not development, `start` scripts validate that the
  configured backend (AWS Secrets Manager, Vault or environment
  injection) already contains the required credentials plus rotation
  metadata (`rotatedAt`, `version`, optionally `expiresAt`). Missing or
  stale secrets cause an immediate failure so remediation happens before
  deployment.【F:start.sh†L1-L64】【F:start.ps1†L1-L64】

## 3. Local CI checklist

Run the full suite before opening a pull request:

```bash
# Backend tests & coverage
backend/venv/bin/pytest --cov=backend --cov-report=term-missing

# Frontend unit tests & coverage
npm run test:coverage

# Playwright end-to-end smoke tests
npm run test:e2e
```

Linting is enforced inside these commands via ESLint/Prettier on the
frontend and Ruff/pytest on the backend. If Playwright browsers are not
installed locally, run `npx playwright install --with-deps chromium`
once.

## 4. Documentation expectations

- Update [`docs/README.md`](README.md) and the relevant sub-guides when
  behaviour changes. Commit documentation alongside code.
- Capture significant architectural changes in
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
- Historical artefacts live in `docs/archive/`; do not rely on them for
  active work.

## 5. Working with AI assistance

- Use the prompt templates under `docs/PROJECT_PRIMER_PROMPT.md` and
  `docs/PROMPT_ATTACHMENT_MATRIX.md` to craft reproducible Codex/ChatGPT
  sessions. Log any automated generation that materially influences a
  patch in your pull request description.
- Never share PHI or private keys with external services. The backend
  already de-identifies text before reaching OpenAI; mirror that
  discipline in prompts.

## 6. Dependency management

- For Python, modify `backend/requirements*.txt` and regenerate locked
  environments via the installer. Document rationale for new packages in
  the pull request.
- For Node, run `npm install <pkg>` from the repository root (respecting
  workspaces) and commit the updated `package.json`/lockfiles.

Adhering to this SOP ensures releases remain reproducible and that AI
assistance is auditable.
