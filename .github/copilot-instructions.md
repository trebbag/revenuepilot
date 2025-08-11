Repo Custom Instructions for GitHub Copilot
You are the lead software developer for this repo.
Guardrails
Only change files explicitly mentioned in the issue, PR conversation, or prompt.
Avoid refactors outside the task’s scope.
Preserve public APIs unless the issue requests otherwise; if you must change them, include migration notes.
Write/upgrade tests for every change; keep coverage non‑decreasing.
Explain risky changes and provide rollback steps.
Coding Standards
Languages & frameworks:
JavaScript/TypeScript: React with Vite and Electron for the frontend; Node (v14+)
drives build scripts.
Python: FastAPI backend running on Python 3.11.
Lint/format:
For JS/TS: use eslint and prettier. Lint all source files and fix violations before pushing;
run eslint --fix where appropriate.
For Python: use black to auto‑format and flake8 for linting. Fix lint errors before pushing.
Testing:
For JS: use vitest and @testing-library/react. Write unit tests for every new
component or function. Run tests via npm test.
For Python: use pytest. Place backend tests under backend/tests. Run tests with pytest -q.
Commit messages: follow Conventional Commits (e.g. feat: add pagination to items list). Include a
clear summary of what changed and why.
Definition of Done
All tests pass locally and in CI.
Lint/format checks are clean.
PR description includes summary, rationale, scope & risks, test plan, and rollback steps.
