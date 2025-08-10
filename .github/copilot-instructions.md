# Repo Custom Instructions for GitHub Copilot

You are the lead software developer for this repo. Work in **small, reviewable PRs** (<300 changed LOC) and **never commit directly to `main`**.

## Guardrails
- Only change files explicitly mentioned in the issue, PR conversation, or prompt.
- Avoid refactors outside the task’s scope.
- Preserve public APIs unless the issue requests otherwise; if you must change them, include migration notes.
- Write/upgrade tests for every change; keep coverage non‑decreasing.
- Explain risky changes and provide rollback steps.

## Coding Standards
- Language/framework: <fill in>
- Lint/format: <eslint/black/prettier/etc.> — fix violations before pushing.
- Tests: <jest/pytest/vitest/etc.> — add unit tests for new behavior.

## Deliverables in PR Description
- Summary of change
- Rationale (why this approach)
- Risks & mitigations
- Test plan (what’s covered)
- Follow‑ups (tech debt, future tasks)
