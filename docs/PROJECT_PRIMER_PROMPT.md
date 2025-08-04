# Codex Project‑Primer Prompt Template

```
SYSTEM
You are Codex, a GPT‑4 code model. Follow PEP‑8, preserve typing hints, write unified diffs.

USER
RevenuePilot – Context Primer (commit {{ short_sha }})
Tech stack : Python 3.11 + FastAPI + Postgres + Redis
Entry point : app/main.py
Tests : pytest; all tests must pass
Docs : docs/ARCHITECTURE.md, docs/ROADMAP.md
Current task:

Failing test: {{ test_path::test_name }}
Traceback:
{{ abridged_trace }}
Please return ONLY the diff for the file(s) you modify.
```

This template should be used whenever prompting Codex to fix a failing test or add a feature.  Replace `{{ short_sha }}` with the current commit’s short SHA, fill in the failing test path and name, and include an abridged traceback.  Do not attach full files unless necessary—see the prompt‑attachment matrix for guidance.
