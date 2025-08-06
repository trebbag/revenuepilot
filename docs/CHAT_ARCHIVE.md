# Distilled Chat Archive

The `rp_chats` archive contained a set of planning documents and business discussions.  The following points capture the essential reasoning, decisions and rules expressed by the founders.  Non‑technical chit‑chat has been omitted.

## Vision and Problem Statement

- **Mission:** Build an AI‑powered clinical documentation assistant that helps outpatient providers write comprehensive notes, capture all billable codes and comply with payer requirements.  The app aims to reduce under‑coding, missed revenue and documentation deficiencies【565843205015217†screenshot】.
- **Target users:** Independent and nurse‑practitioner‑led clinics who often lack sophisticated coding tools.  The product must be platform‑agnostic and EHR‑agnostic—providers copy the final note into any EHR instead of relying on plug‑ins.【565843205015217†screenshot】

## Core Features (MVP)

- **Rich‑text editor:** A WYSIWYG editor with templates for SOAP notes, wellness visits and follow‑ups.  Users can insert templates and maintain drafts.
- **Live AI guidance:** As the note is written, AI agents suggest CPT/ICD codes, flag missing documentation, recommend public‑health interventions and list plausible differentials.  Results are presented in a suggestion panel that can be toggled per category.
- **Beautification:** A single click formats the draft into a professional SOAP‑style note without altering the underlying clinical facts.
- **Patient‑friendly summary:** A summary endpoint rewrites the note in plain language at an eighth‑grade reading level.
- **Analytics dashboard:** Tracks counts of notes, beautify actions, suggestions, summaries, chart uploads and audio recordings, plus average note length and beautify time【447379025536466†screenshot】.
- **API‑key management:** The OpenAI key is stored locally and loaded per call; no PHI is transmitted without de‑identification.

## Key Design Choices

- **Local de‑identification:** Before any LLM call, the note is scrubbed of phone numbers, dates, emails, SSNs, addresses and capitalised names using optional ML‑based engines (Presidio, Philter or scrubadub) with a regex fallback.  This prevents PHI leakage【565843205015217†screenshot】.
- **Prompt discipline:** System messages instruct the model to adhere to the SOAP structure, restrict output to JSON, limit the number of codes/differentials and avoid hallucination.  Custom clinical rules entered by the user are appended to the prompt.
- **Per‑call API key lookup:** The OpenAI key is read from `openai_key.txt` on each request.  This avoids server restarts when the key changes and simplifies packaging.
- **SQLite analytics:** A zero‑configuration database records events.  The roadmap notes that the design can later migrate to Postgres or Redis for scalability【565843205015217†screenshot】.
- **Electron‑ready frontend:** The React app runs entirely locally and communicates with the backend via HTTP; no external EHR integrations are required.  This design allows packaging as an Electron desktop app without depending on third‑party APIs.

## Business Rules and Constraints

- **Coding suggestions:** The AI must return at most five CPT/ICD codes supported by the note.  Each code includes a rationale.  It should never invent codes not justified by the text.
- **Compliance prompts:** Highlight missing documentation elements (e.g. incomplete history, missing ROS) that could lead to down‑coding or denials.
- **Public‑health reminders:** Suggest general measures such as vaccines or screenings without assuming personal details.
- **Differentials:** List plausible differential diagnoses (up to five) consistent with the symptoms.  Use empty arrays when no suggestions apply.
- **Privacy:** De‑identified text only; no PHI is stored or transmitted.  Chart uploads and audio recordings remain in the client’s `localStorage`.
- **Subscription pricing:** $99 per provider per month for solo users and $499+ per clinic for group analytics.  The founders plan to pilot in their own clinic before wider release (detailed pricing and budget appear in the full plan document).

## Known Gaps and Pain Points

The archive identifies several unfinished or missing capabilities that need prioritisation:

- **Speech‑to‑text & diarisation:** `audio_processing.py` contains stubs; the roadmap calls for integrating Whisper or a similar model and adding a `/transcribe` endpoint.
- **Role‑based authentication:** There is no login or user management.  A simple JWT‑based auth system is proposed to distinguish clinicians from admins.
- **Analytics visualisation:** The dashboard currently displays counts only.  Charts (e.g. time‑series graphs) should be implemented using a library like Chart.js.
- **Packaging:** The project needs an Electron builder config, code signing and auto‑update pipeline before distribution【447379025536466†screenshot】.
- **Unit & integration tests:** Very few tests exist.  A comprehensive test suite (backend with pytest, frontend with React Testing Library) is required【447379025536466†screenshot】.
- **EHR integration (future):** A plan to post finished notes and codes to EHRs using FHIR is mentioned but not started.

These pain points form the basis for the roadmap and the failing tests supplied with this migration.
