# RevenuePilot App Skeleton

![Python Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/revenuepilot/revenuepilot/main/coverage/python-coverage.json)
![JS Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/revenuepilot/revenuepilot/main/coverage/js-coverage.json)

This directory contains a **minimal scaffold** for the RevenuePilot desktop application.
It is designed to reflect the approved wireframes (note editor with tabbed draft/beautified views
and a suggestion panel) and uses a clean, high‑contrast colour palette.  The scaffold is not
fully functional on its own—it requires you to install dependencies and wrap the React
app into an Electron shell for desktop deployment.

## Patient lookup & encounter validation

The draft editor exposes a lookup bar above the note where you can search the mock EHR directory
by patient name, MRN or identifier. Suggestions stream in as you type and are cached for quick
re‑use. Selecting a patient persists the ID for auto‑save, analytics and export workflows so
returning to the chart reloads the draft immediately. The encounter field next to it validates the
identifier with the backend and surfaces helpful messages when an encounter is missing or mapped to
another patient. Clearing either field resets the linkage so you never attach notes to the wrong
record.

## Running locally

### Quick start

To install all dependencies and produce a packaged desktop build in one step, run:

```bash
./setup.sh        # macOS/Linux
# or
.\setup.ps1       # Windows PowerShell
```

This script invokes the installer and then runs `npm run electron:build`. Built artifacts will be placed in the `dist/` directory. If you prefer to execute the steps manually, follow the instructions below.

1. Install [Node.js](https://nodejs.org/) (version 14 or later).
2. Navigate to this folder and install dependencies:

   ```bash
   cd revenuepilot-app-skeleton
   npm install
   ```

   If you see errors installing packages, you may need to check your internet
   connectivity or proxy settings.  The dependencies listed in `package.json`
   include React, React DOM, React Quill (for the rich text editor), Vite, and
   the React plugin for Vite.

3. **Start the development servers.**

   There are two ways to run both the backend and the frontend:

   *Using the helper script*

   A convenience script `start.sh` (or `start.ps1` on Windows) has been added to start both the FastAPI backend and the Vite frontend together.  From the project root run:

   ```bash
   ./start.sh        # macOS/Linux
   # or
   .\start.ps1      # Windows PowerShell
   ```

   This launches the backend on port 8000 in the background and then starts the React development server.  You can view the app at the URL printed by Vite (usually `http://localhost:5173`).  When you stop the frontend (e.g. via `Ctrl+C`), the backend will be terminated automatically.

   *Manual startup*

   If you prefer to run the servers separately, start the backend in one terminal:

   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

   Then, in another terminal, start the frontend:

   ```bash
   export VITE_API_URL=http://localhost:8000
   npm run dev
   ```

   The environment variable `VITE_API_URL` tells the frontend where to reach the backend.  Without it, the app will fall back to stubbed data.

4. **Configure the OpenAI API key**

   The app now includes a Settings page where you can paste your OpenAI API key.  The key is stored on your machine in the backend directory (`openai_key.txt`) and loaded automatically when the backend starts.  To set the key:

   1. Start both the backend and frontend as described above.
   2. In the running app, open **Settings**, paste your key into the **OpenAI API Key** field and click **Save Key**.
   3. Restart the backend once after saving so it loads the key from `openai_key.txt`.  The frontend does not need to be restarted.

   If you prefer not to use the UI, you can manually create the file `backend/openai_key.txt` containing your secret key and restart the server.

### Environment configuration & database bootstrap

Before running the full stack ensure the runtime environment is configured and the database is pre-seeded. The backend must always be started before the frontend so that the React application can hydrate its contexts from live API data.

| Variable | Description |
| --- | --- |
| `REVENUEPILOT_DB_PATH` | Path to the SQLite database used by the backend. Defaults to the application data directory (e.g. `~/Library/Application Support/RevenuePilot/analytics.db`). |
| `JWT_SECRET` | Secret used to sign JWT access and refresh tokens. **Required in production**. |
| `REVENUEPILOT_ADMIN_USERNAME` / `REVENUEPILOT_ADMIN_PASSWORD` | Optional overrides for the seeded administrator account. |
| `REVENUEPILOT_ANALYST_USERNAME` / `REVENUEPILOT_ANALYST_PASSWORD` | Optional overrides for the seeded analytics role. |
| `REVENUEPILOT_CLINICIAN_USERNAME` / `REVENUEPILOT_CLINICIAN_PASSWORD` | Optional overrides for the default clinician role. |
| `VITE_API_URL` | Frontend environment variable pointing at the running backend (e.g. `http://localhost:8000`). |

Seed the database with the required compliance rules, code catalogues, payer schedules, and default user roles by running:

```bash
python scripts/bootstrap_database.py
```

The script creates admin, analyst, and clinician accounts using the credentials above (or the documented defaults) and ensures the reference data expected by the UI exists before first launch. To replace existing catalogues use `--overwrite-reference-data`; pass `--skip-user-seed` if you will provision accounts manually.

Once the database is bootstrapped, start the backend (`uvicorn backend.main:app --reload --port 8000` or via `./start.sh`). After the API reports a successful startup, launch the frontend (`npm run dev` with `VITE_API_URL` set) so the React contexts can hydrate from the populated backend.

#### Integration checklist

Complete this quick checklist before testing new frontend builds against the live API:

1. Review the environment variable table above and export any overrides required for your setup (`REVENUEPILOT_DB_PATH`, `JWT_SECRET`, role credentials, etc.).
2. Prime the SQLite database with current reference data and seeded users:
   ```bash
   python scripts/bootstrap_database.py
   ```
3. Point the Vite frontend at the running API instance:
   ```bash
   export VITE_API_URL=http://localhost:8000
   ```
   Adjust the URL when targeting remote backends.
4. Start the FastAPI server (`./start.sh` or `uvicorn backend.main:app --reload --port 8000`) and wait for the startup log indicating migrations completed.
5. Launch the frontend (`npm run dev`) with the environment above so components hydrate against real data rather than mock fixtures.

Run through this list whenever you refresh the database or swap between mock and live services—the hydration step depends on both the seeded data and the API URL.

### JWT secret

Authentication tokens issued by the backend are signed with a secret. In production the `JWT_SECRET` environment variable **must** be set before starting the server. If it is missing while `ENVIRONMENT` is anything other than `development`, the application will raise an error at startup. For local development the default `dev-secret` is used so you can run the app without additional configuration.

### Offline model mode (experimental)

Set the environment variable `USE_OFFLINE_MODEL=true` before starting the
backend to bypass calls to external AI services. In this mode the
`/beautify`, `/suggest` and `/summarize` endpoints return deterministic
placeholder data so the app can run without network access or an API key.

To evaluate lightweight local models instead of the fixed placeholders, set
`USE_LOCAL_MODELS=true` and provide model names for any of the endpoints you
wish to test. The weights must be downloaded ahead of time; the helper
`scripts/download_models.py` script fetches tiny demo models and the default
Whisper checkpoint:

```bash
pip install transformers whisper
python scripts/download_models.py
```

You can also trigger the same process from **Settings → Download local models**
which streams progress from the backend. Once the models are cached locally you
can enable them at runtime from the app's **Settings → Enable local models**
toggle or via the environment variables below:

```bash
export USE_OFFLINE_MODEL=true
export USE_LOCAL_MODELS=true
export LOCAL_BEAUTIFY_MODEL=hf-internal-testing/tiny-random-t5
export LOCAL_SUMMARIZE_MODEL=sshleifer/tiny-bart-large-cnn
export LOCAL_SUGGEST_MODEL=hf-internal-testing/tiny-random-gpt2
```

If a model fails to load or does not return the expected structure, the
deterministic offline placeholders are used as a fallback so the API always
responds. See [`docs/LOCAL_MODELS.md`](docs/LOCAL_MODELS.md) for more details,
including a `scripts/validate_models.py` helper that smoke-tests the local
models.

### Local Whisper transcription

For speech-to-text without the OpenAI API, install the open source
[Whisper](https://github.com/openai/whisper) library and download a model:

```bash
pip install openai-whisper
# Whisper relies on ffmpeg for audio conversion
sudo apt-get install ffmpeg  # macOS: brew install ffmpeg

# Download the default "base" model so it is available offline
python - <<'PY'
import whisper
whisper.load_model('base')
PY
```

Start the backend with `OFFLINE_TRANSCRIBE=true` to force use of this local
model:

```bash
export OFFLINE_TRANSCRIBE=true      # macOS/Linux
set OFFLINE_TRANSCRIBE=true         # Windows PowerShell
```

When this flag is set and no `OPENAI_API_KEY` is present, `backend/audio_processing.py`
falls back to the local Whisper model for transcription. Set `WHISPER_MODEL`
to choose a different model size (e.g. `tiny`, `small`).

### Advanced PHI de-identification

Set `DEID_ENGINE` in `.env` to choose the PHI scrubber:

* `presidio` – accurate and entity aware but heavier. Name and date detection use
  high confidence thresholds (tunable via `PRESIDIO_PERSON_THRESHOLD` and
  `PRESIDIO_DATE_THRESHOLD`).
* `philter` – designed for clinical notes; can include or exclude phone numbers
  with `PHILTER_INCLUDE_PHONES=true|false`.
* `scrubadub` – light‑weight library that detects many identifiers but is less
  domain aware.
* `regex` – built-in patterns with no external dependencies but the least comprehensive.

Removed spans become placeholders like `[NAME:abcd1234]`. By default the value
after the colon is a short hash so the original text is not exposed. Set
`DEID_HASH_TOKENS=false` to embed the raw value instead, producing placeholders
such as `[NAME:John Doe]`.

5. **Run the Electron shell**.  The project includes scripts to launch
   an Electron wrapper for development and to build distributable binaries:

   ```bash
   npm run electron:dev
   ```

    This command builds the frontend, sets up the backend by running
    `backend:prebuild`, and starts Electron along with the Python backend so
    you can develop against the desktop shell.

  To create installers for macOS, Windows and Linux you first need to collect
  build-time environment variables.  Run the setup script and follow the
  prompts to create a `.env` file:

  ```bash
  npm run setup-env
  ```

  After `.env` has been written you can build the installers:

  ```bash
  npm run electron:build
  ```

  `electron:build` invokes [`electron-builder`](https://www.electron.build/) to
  produce signed installers for macOS (`.dmg`), Windows (`.exe`) and Linux
  (`AppImage` and `.deb`).  The FastAPI backend along with its virtual
  environment is copied into the final app bundle so the desktop build runs
  without a system Python.

  To test automatic updates locally, point `UPDATE_SERVER_URL` at a server
  hosting the generated artifacts.  A tiny static file server is provided:

  ```bash
  npm run update-server
  ```

  It serves the `dist/` directory on port 8080 and can be used as a target
  for the auto‑update feed during development. See
  [docs/DESKTOP_BUILD.md](docs/DESKTOP_BUILD.md) for a full walkthrough of
  packaging, signing and update testing.

`electron:build` downloads icon assets and bundles the backend.  The `.env`
file is read by the build scripts and should define:

* `OPENAI_API_KEY` – API key consumed by the backend.
* `VITE_API_URL` – URL for the backend API, usually `http://localhost:8000`.
* `ICON_PNG_URL`, `ICON_ICO_URL`, `ICON_ICNS_URL` – URLs for 256×256 PNG,
  Windows `.ico`, and macOS `.icns` icons.
* `UPDATE_SERVER_URL` – feed URL for auto‑updates, e.g.
  `https://updates.revenuepilot.com`.
* `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` – path and password to the
  Windows Authenticode certificate.
* `CSC_LINK` and `CSC_KEY_PASSWORD` – path and password to the macOS
  Developer ID certificate.

If any of these variables are omitted the build will proceed without code
signing or update configuration, emitting a warning instead of failing.

### Code signing certificates

For production builds each platform must be signed:

**Windows**

1. Purchase an Authenticode certificate from a trusted CA.
2. Export it as a `.p12`/`.pfx` file.
3. Set `WIN_CSC_LINK` to the file path and `WIN_CSC_KEY_PASSWORD` to the
   certificate password in `.env`.

**macOS**

1. Enrol in the Apple Developer Program and create a "Developer ID Application" certificate.
2. Export the certificate as a `.p12` file.
3. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` in `.env`.

Electron‑builder reads these variables during packaging.


### Update server

Run a minimal HTTP server to host built artifacts for auto‑update testing:

```bash
npm run update-server
```

This serves the `dist/` directory on port 8080. For production, deploy the
contents of `dist/` to a publicly reachable server and set
`UPDATE_SERVER_URL` to that address when building.

After packaging, run the output located in `dist/`:


   * **macOS** – open the generated `.dmg`/`.zip` or run `open dist/mac/RevenuePilot.app`.
   * **Windows** – execute `dist/RevenuePilot Setup.exe`.
   * **Linux** – run `dist/RevenuePilot-<version>.AppImage` or install the
     `.deb` package.

## Structure

```
revenuepilot-app-skeleton/
├── index.html            # Entry HTML file
├── package.json          # Project metadata and dependencies
├── src/
│   ├── App.jsx           # Main React component (toolbar, tabs, panels)
│   ├── main.jsx          # ReactDOM entry point
│   ├── components/
│   │   ├── NoteEditor.jsx    # Rich text editor (falls back to textarea)
│   │   └── SuggestionPanel.jsx  # Displays AI-powered suggestions
│   └── styles/
│       ├── variables.css  # Colour palette variables
│       └── app.css        # Layout and component styles
└── README.md             # This file
```

## Next steps

The scaffold now includes a rich‑text editor via `react-quill` and a fully
functional API layer.  To complete the integration with a true AI model and
deploy RevenuePilot, consider the following steps:

1. **Install dependencies**: Ensure `react-quill` and `openai` are installed
   via `npm install` and `pip install -r backend/requirements.txt`.  The
   backend can optionally perform speaker diarisation using
   `pyannote.audio`; to enable this run `pip install pyannote.audio
   torchaudio` in addition to the base requirements.  The installer script
   (`install.sh`) automates most of this setup.

2. **Configure your OpenAI API key**: Set the environment variable
   `OPENAI_API_KEY` before starting the backend.  For example:

   ```bash
   export OPENAI_API_KEY=sk-your-key-here  # project keys like sk-proj-... also work
   uvicorn backend.main:app --reload --port 8000
   ```

   The backend uses the prompts defined in `backend/prompts.py` to call the
   OpenAI Chat Completion API.  If the key is missing or a network error
   occurs, the API falls back to simple rule‑based suggestions.

3. **Connect the frontend to the backend**: Start the React app with
   `VITE_API_URL` pointing at your backend, e.g.:

   ```bash
   VITE_API_URL=http://localhost:8000 npm run dev
   ```

   The functions in `src/api.js` detect this and send HTTP requests to
   `/beautify`, `/suggest`, `/event` and `/metrics` accordingly.

4. **Iterate on prompt engineering**: Adjust the prompts in
   `backend/prompts.py` to better reflect your clinic’s documentation
   standards.  Use the analytics endpoints to gather feedback on
   suggestion quality and iterate on the prompts to reduce hallucinations and
   improve coding accuracy.

5. **Secure and scale**: Implement authentication, persist analytics
   events to a database, and consult the packaging guide to produce
   signed installers via `electron-builder` when distributing a desktop
   version. Remember to maintain HIPAA compliance by de‑identifying notes
   before sending them to any external API.

### De-identification assumptions

The backend's `deidentify` helper uses the [`scrubadub`](https://github.com/datasnakes/scrubadub)
library along with regex fallbacks.  It targets common US‑centric patterns
such as multi‑word names, several date formats, phone numbers, addresses,
emails and Social Security numbers, replacing them with bracketed tokens
like `[NAME]` or `[DATE]`.  Unusual formats or non‑English text may not be
fully scrubbed, so manual review remains necessary for sensitive data.
Set the environment variable `DEID_ENGINE` to `presidio` or `philter` to
explicitly choose a PHI scrubbing backend.  When unset, Presidio is used when
available, falling back to Philter and then simple regexes.

These steps will transform the scaffold into a fully operational clinical
documentation assistant.

This scaffold should give you a solid starting point for building the
RevenuePilot app with minimal setup.  Feel free to modify the palette
(`variables.css`) to match your chosen aesthetic.

## Continuous Integration & Coverage

Pull requests and pushes to `main` trigger the CI workflow (`.github/workflows/ci.yml`). The pipeline:

* Installs frontend dependencies, lints with ESLint/Prettier, and runs Vitest with coverage (`npm run test:coverage`).
* Installs backend dev dependencies (`backend/requirements_dev.txt`), runs pytest with coverage, and lints Python code.
* Enforces a minimum 80% lines coverage for both Python and JS. The job fails if either drops below threshold.
* Publishes JSON badge descriptors to `coverage/js-coverage.json` and `coverage/python-coverage.json` and uploads the `coverage/` folder as a build artifact for inspection.

These JSON files drive the dynamic shields.io badges at the top of this README. To update badges locally you can run:

```bash
npm run test:coverage
pytest --cov=backend --cov-report=json:coverage/python-coverage-raw.json
```

End-to-end quality gates are back through the workspace scripts. Execute `npm run test:e2e` to drive the Playwright suite once the backend endpoints are running—the tests rely on real API hydration and now cover the newly wired flows alongside the Vitest and pytest coverage checks above.

Then convert the Python JSON to badge format (replicating the CI step) if desired.

## FHIR / EHR Export

The application can generate and (optionally) POST a FHIR Transaction Bundle representing the current clinical note plus selected billing / clinical codes.

1. In the editor, select the codes you wish to include (checkbox list inside the suggestions panel).  If you do not select any, all suggested codes will be used.
2. Click "Export to EHR" (available in both Draft and Beautified tabs).  The frontend calls the `/export` backend endpoint with the note HTML and selected codes.
3. Backend behaviour:
   * If `FHIR_SERVER_URL` points at a real server, a `Bundle` resource (type `transaction`) is POSTed to `<FHIR_SERVER_URL>/Bundle`.
   * If `FHIR_SERVER_URL` is unset or left at the placeholder `https://fhir.example.com`, no network request is made and the bundle JSON is returned with status `bundle` so you can download it manually.

### Bundle Contents

The bundle currently includes these resources:

* `Composition` – high level document structure referencing all created entries.
* `Observation` – an Observation with `valueString` holding the raw note text.
* `DocumentReference` – base64 encoded note content.
* `Claim` – billing items built from submitted codes.
* One resource per code inferred heuristically as one of: `Condition`, `Procedure`, `Observation`, `MedicationStatement`.
  * Codes starting with `MED` -> MedicationStatement
  * Starting with `PROC` or `P` + digits -> Procedure
  * Starting with `OBS` or vital prefixes (`BP`, `HR`, `TEMP`) -> Observation
  * Otherwise -> Condition (fallback)

### Server Configuration

Set these environment variables for automated posting:

* `FHIR_SERVER_URL` – Base URL of the FHIR server (e.g. `https://ehr.example.org/fhir`).
* OAuth2 Client Credentials (optional, preferred):
  * `EHR_TOKEN_URL`
  * `EHR_CLIENT_ID`
  * `EHR_CLIENT_SECRET`
* OR Basic / static token auth fallbacks:
  * `EHR_BASIC_USER`, `EHR_BASIC_PASSWORD`
  * `EHR_BEARER_TOKEN` (static pre‑issued bearer token)

When OAuth2 variables are set the backend fetches and caches an access token. If token retrieval fails it transparently falls back to basic or static token auth if those credentials are present.

### Manual Download Workflow

If the server is not configured the `/export` response has:

```json
{ "status": "bundle", "bundle": { "resourceType": "Bundle", ... } }
```

The frontend triggers a download named `fhir_bundle.json`. You can upload this bundle via your EHR's import tooling or a generic FHIR test harness.

### Testing

Automated tests (`tests/test_ehr_integration.py`) verify:

* Authentication requirements for `/export`.
* Proper assembly of required resource types.
* Handling of auth failures, server errors and network exceptions.

To run only these tests:

```bash
pytest tests/test_ehr_integration.py -q
```

### Frontend end-to-end smoke tests

A Playwright suite now exercises the Vite-driven web frontend against a fully
mocked API surface. The test boots the `revenuepilot-frontend` workspace,
authenticates via the mock, loads analytics, inspects the activity log, and
walks the documentation workflow through visit finalisation.

Install the Playwright browser binaries once (Chromium is sufficient for CI):

```bash
npx playwright install --with-deps chromium
```

Then run the suite from the repository root:

```bash
npm run test:e2e
```

The command automatically launches the Express-based mock API defined in
`tests/mocks/frontend-api-server.js` and the Vite dev server for the
`revenuepilot-frontend` workspace. Environment variables `FRONTEND_API_PORT`
and `FRONTEND_DEV_PORT` can be overridden when needed for local conflicts. The
tests leave behind Playwright traces and videos for failures inside
`playwright-report/`.

### UI Enhancements

The editor displays a badge on the Export button showing the count of codes that will be sent. A classification summary row (C / P / O / M) appears beneath the patient / encounter ID inputs:

* C – Condition (ICD-10 or fallback)
* P – Procedure (CPT style codes)
* O – Observation (LOINC pattern, vitals or OBS*)
* M – MedicationStatement (MED* / RX* prefixes)

If patient or encounter identifiers are entered they will be included in the relevant resource references (Claim, DocumentReference, Composition sections).

### Optional audio (diarisation) dependencies

Heavy audio / diarisation packages have been extracted from the core backend requirements to avoid build failures on platforms without compatible wheels (notably `torchaudio`). They now reside in `backend/requirements_audio.txt` and are only attempted when you explicitly opt in.

Environment flags:

* `WANT_AUDIO_EXTRAS=true` – attempt to install `pyannote.audio`, `torchaudio` and related heavy deps.
* `OFFLINE_TRANSCRIBE=true` – enables local Whisper usage; also triggers optional audio install if `WANT_AUDIO_EXTRAS` is not set.
* `SKIP_PIP_UPGRADE=true` – skip the automatic `pip/setuptools/wheel` upgrade step during prebuild (useful in constrained / offline environments).

If installation fails the prebuild script logs a warning and continues so the core app (note editor, FHIR export, de‑identification, LLM beautify) still works.

Recommended macOS (CPU‑only) manual install sequence if you need diarisation and automatic install fails:

```bash
cd backend
python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip setuptools wheel
# Install a matching torch / torchaudio pair (example versions, adjust as needed)
./venv/bin/pip install torch==2.2.2 torchaudio==2.2.2 --index-url https://download.pytorch.org/whl/cpu
./venv/bin/pip install -r requirements_audio.txt
```

Then rerun the desktop build with `WANT_AUDIO_EXTRAS=true`.

### Backend prebuild tooling upgrade

`npm run backend:prebuild` now always attempts to upgrade `pip`, `setuptools` and `wheel` inside the freshly created virtualenv for more reliable wheel resolution. Set `SKIP_PIP_UPGRADE=true` to disable this behavior.