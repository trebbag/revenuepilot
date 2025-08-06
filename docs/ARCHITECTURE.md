# RevenuePilot Architecture Overview

This document provides a high‑level overview of the components that make up the RevenuePilot application.  It explains how requests flow through the system, where data is stored and what third‑party services are involved.  The intention is to orient new developers so they can navigate the codebase quickly and identify the key modules to extend.

## Layers and Modules

### Frontend (`src/`)

- **App shell** (`App.jsx`): Houses the main layout, view router and tab system.  It mounts the rich‑text editor, the suggestion panel, the dashboard, logs, settings and drafts views.  The app maintains React state for the current draft, beautified note, summary, patient ID and user settings.
- **Rich‑text editor** (`NoteEditor.jsx`): Wraps `react‑quill` to provide a WYSIWYG editor for clinicians.  It exposes callbacks for changes and integrates with templates.  When the user presses _Beautify_ or _Summarize_, it sends the plain text to the backend via the API helpers.
- **Suggestion panel** (`SuggestionPanel.jsx`): Displays coding suggestions, compliance prompts, public‑health reminders and differential diagnoses.  It listens for updates from the API and supports toggling individual categories via settings.
- **Dashboard** (`Dashboard.jsx`): Queries the `/metrics` endpoint and renders aggregate counts and averages.  Future versions will visualise trends using charts.
- **Logs** (`Logs.jsx`): Calls `/events` to stream recent events for debugging.  Shows event type, timestamp and any details.
- **Settings** (`Settings.jsx`): Lets users select a theme, enable/disable suggestion categories, enter custom clinical rules and store the OpenAI API key.  Saving the key posts to `/apikey` which writes it to `backend/openai_key.txt`.
- **Drafts** (`Drafts.jsx`): Saves drafts to `localStorage` using the patient ID as a key.  Users can switch patients and recall previous drafts.
- **Sidebar** (`Sidebar.jsx`): Provides navigation between note taking, drafts, dashboard, logs, settings and help views.  It collapses on small screens.

### Backend (`backend/`)

- **FastAPI application** (`main.py`): Exposes endpoints to beautify notes (`/beautify`), suggest codes and compliance (`/suggest`), generate patient‑friendly summaries (`/summarize`), record analytics events (`/event`), return aggregated metrics (`/metrics`), stream events (`/events`) and set the OpenAI API key (`/apikey`).  It also initialises a SQLite database in the user's data directory to persist events.
- **Prompt templates** (`prompts.py`): Contains functions to build chat prompts for beautification, suggestion generation and summarisation.  Each prompt includes system instructions emphasising de‑identification, no hallucination and JSON output formats.  Prompts accept a `lang` parameter (`en` or `es`) and may load extra instructions from `backend/prompt_templates.json` or `.yaml` keyed by specialty or payer.
- **OpenAI client wrapper** (`openai_client.py`): Wraps `openai.ChatCompletion.create` and reads the API key either from the environment or from `openai_key.txt`.  It hides the details of the OpenAI SDK from the rest of the codebase.
- **Audio processing** (`audio_processing.py`): Provides stubbed functions for diarisation and transcription.  They return empty strings and need to be implemented with real speech‑to‑text libraries (e.g. Whisper, pyannote).  This module demonstrates the expected API and highlights a current gap in functionality.

### Storage

- **SQLite analytics database** (`analytics.db` in the user data directory): A lightweight embedded database created on startup.  It stores rows of events with their type, timestamp and JSON‑encoded details.  The `/metrics` endpoint computes aggregates directly from this table.
- **API key file** (`backend/openai_key.txt`): When the user saves their OpenAI key in the settings UI, it is written to this file.  On startup, the backend loads it into the process environment.
- **Client‑side storage**: Drafts, chart uploads and audio data are stored in the browser’s `localStorage` to avoid transmitting PHI.

### Third‑Party Services

- **OpenAI**: Used for beautification, coding/compliance suggestions and patient‑friendly summaries.  Requests are made through the wrapper in `openai_client.py` using chat models (GPT‑4o by default).  Only de‑identified text is sent.
- **Potential future services**: The plan mentions using a speech‑to‑text API (e.g. Whisper) for audio transcription and possibly Redis/Postgres in place of SQLite for analytics.  These are not implemented yet but are considered in the roadmap.

## Data Flow

1. A clinician types or pastes a note into the rich‑text editor.  Drafts are stored locally using the patient ID as the key.
2. When the user clicks **Beautify**, the frontend strips HTML tags and sends the plain note to `/beautify`.  The backend de‑identifies the text, calls the beautify prompt via OpenAI and returns a cleaned version.  On failure it uppercases the note as a fallback.
3. When the user clicks **Suggest**, the frontend concatenates the note with any uploaded chart text, audio transcript and custom rules, then calls `/suggest`.  The backend de‑identifies the text, builds a prompt instructing the model to return JSON with codes, compliance tips, public‑health suggestions and differentials.  If the LLM call fails, a rule‑based fallback provides basic suggestions.
4. When the user clicks **Summarize**, the frontend sends the note, chart and audio transcript to `/summarize`.  The backend de‑identifies and calls the summary prompt; on failure it truncates the note as a fallback.
5. Each significant action (starting a note, beautifying, suggesting, summarising, uploading a chart, recording audio) is logged via `/event`.  The backend inserts the event into the SQLite table and appends it to an in‑memory list.  The `/metrics` endpoint queries this table to compute counts and averages; `/events` returns the most recent events.

## Deployment Notes

The current repository is designed for local development.  The `start.sh` script (or `start.ps1` on Windows) runs `uvicorn` for the backend on port 8000 and `npm run dev` for the React frontend on port 5173, setting `VITE_API_URL` accordingly.  In production, the frontend can be bundled with Electron and the backend can be packaged with Gunicorn/Uvicorn.  The roadmap includes tasks for Electron packaging, code‑signing, auto‑updates and migration to a full database such as Postgres.

## Customising Prompt Templates

Prompt instructions can be tailored per specialty or payer.  Create a `backend/prompt_templates.json` or `backend/prompt_templates.yaml` file with entries under `specialty` or `payer` that map to custom `beautify`, `suggest`, or `summary` instructions.  Each instruction can provide translations via `en` and `es` keys.  When a request supplies matching `specialty` or `payer` values, the custom text is appended to the default prompts.
