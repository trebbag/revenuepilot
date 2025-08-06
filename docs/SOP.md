# Developer Operating Procedure (SOP)

This standard operating procedure describes how to work on the RevenuePilot codebase.  Following these guidelines ensures consistent collaboration, reproducible builds and an auditable record of AI‑assisted development.

## 1. Branching Model

- Use a simple trunk‑based workflow.  The `main` branch contains stable code that always passes all tests.  Create a feature branch off `main` for each task or bug fix (e.g. `feat/audio-transcription` or `fix/deidentify-names`).  Avoid long‑lived branches.
- Before starting a new branch, ensure your local `main` is up to date:
  ```bash
  git checkout main
  git pull origin main
  ```
- When the feature is complete and tests pass locally, open a pull request targeting `main`.  Use a descriptive branch name and commit messages (see below).

## 2. Commit Messages

- Start each commit message with a concise summary (≤50 chars) followed by an optional blank line and details.  Reference the roadmap item or test you are addressing.
- Example:
  ```
  feat: implement simple audio transcription stub

  Adds a Whisper API call in audio_processing.simple_transcribe and updates tests.
  Fixes tests::test_audio_transcription_returns_text.
  ```
- Squash minor fixes into a single commit before merging to keep history clean.

## 3. Running Local CI

Run the following commands before opening a pull request:

```bash
# Activate virtualenv
source .venv/bin/activate

# Backend tests and coverage
pytest -q --cov=backend --cov-report=term-missing

# Linting
ruff backend tests

# Frontend unit tests (if applicable)
npm test -- --silent
```

All tests and linters must pass locally.  Aim for >90 % coverage on new code.

## 4. Archiving Codex Interactions

- Log each Codex‑powered session in `docs/DEV_LOG.md`.  Include the date, the prompt you used, any files attached, and a brief summary of the output.
- Format each entry like:
  ```
  ## 2025‑08‑04 – Implement transcription stub

  **Prompt:** Used Project‑Primer with failing test path `tests/test_blockers.py::test_audio_transcription_returns_text`.  Attached `audio_processing.py`.

  **Result:** Codex generated a diff adding a call to Whisper API.  Applied and tests passed.
  ```
- Do not paste your API keys or PHI into the log.  The log serves as an audit trail and knowledge base for future developers.

## 5. Keeping Dependencies Up to Date

- Use `pip-tools` or a similar tool (not yet included) to manage Python dependencies.  When adding a new package, update `backend/requirements.txt` and document the reason in the pull request.
- For Node dependencies, run `npm install <package> --save` or `--save-dev` and commit the updated `package.json` and `package-lock.json`.

## 6. Optional PHI Scrubbers

The backend can leverage advanced de‑identification libraries beyond the default regex patterns.

- **Presidio**
  ```bash
  pip install presidio-analyzer spacy
  python -m spacy download en_core_web_sm
  export DEID_ENGINE=presidio
  ```
- **Philter**
  ```bash
  pip install philter-ucsf
  export DEID_ENGINE=philter
  ```

Set `DEID_HASH_TOKENS=false` to keep raw values in placeholders when debugging.

By adhering to this SOP, the team can collaborate efficiently, maintain high code quality and ensure that AI assistance is tracked responsibly.
