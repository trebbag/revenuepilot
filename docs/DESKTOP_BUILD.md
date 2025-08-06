# Desktop Build and Auto-Update Guide

This document describes how to package the RevenuePilot application into
installers for macOS, Windows and Linux and how to exercise the automatic
update flow during development.

## 1. Collect build-time environment variables

Before packaging, populate a `.env` file with the required values. The helper
script will prompt for all necessary fields, including paths to code-signing
certificates:

```bash
npm run setup-env
```

The following variables are written to `.env`:

- `OPENAI_API_KEY` – API key used by the backend.
- `VITE_API_URL` – URL for the FastAPI server during development.
- `ICON_PNG_URL`, `ICON_ICO_URL`, `ICON_ICNS_URL` – URLs to icon assets.
- `UPDATE_SERVER_URL` – feed URL for auto-updates.
- `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` – Windows Authenticode certificate
  and password.
- `CSC_LINK`, `CSC_KEY_PASSWORD` – macOS Developer ID certificate and
  password.
- `LINUX_CSC_LINK`, `LINUX_CSC_KEY_PASSWORD` – optional Linux code-signing
  certificate and password.

## Obtaining code-signing certificates

Windows builds require an Authenticode code-signing certificate. These can be
purchased from certificate authorities such as DigiCert or GlobalSign. Export
the certificate to a `.p12` file, host it securely and set `WIN_CSC_LINK` to
its path or URL along with `WIN_CSC_KEY_PASSWORD`.

macOS builds require membership in the Apple Developer Program. Create a
*Developer ID Application* certificate in the Apple Developer portal, export it
as a `.p12` file and configure `CSC_LINK` and `CSC_KEY_PASSWORD` with the file
location and password.

Linux builds can also be signed. Export a suitable code-signing certificate to a
`.p12` file and set `LINUX_CSC_LINK` and `LINUX_CSC_KEY_PASSWORD`.

## 2. Build signed installers

Running the build script bundles the React frontend, the FastAPI backend and
its Python virtual environment into a single Electron application. The output
includes signed installers for all three major platforms:

```bash
npm run electron:build
```

The backend is copied into the application bundle under `resources/backend`,
allowing the packaged app to run without a system Python installation.

## 3. Test auto-update locally

A small static file server is provided to host the generated artifacts for
update testing. After building, serve the `dist/` directory:

```bash
npm run update-server
```

Point `UPDATE_SERVER_URL` at `http://localhost:8080` before building to let the
app check this server for updates via `electron-updater`.

## 4. Verify the macOS installer

On macOS, open the generated `.dmg` in `dist/` and drag **RevenuePilot.app** to
`/Applications`. Launching the app should start both the Electron frontend and
the bundled FastAPI backend automatically.

## 5. Smoke tests

Basic smoke tests ensure the presence of packaging and update wiring. Run the
Python test suite to execute them:

```bash
pytest
```

These tests confirm that:

- `electron/main.js` references `electron-updater` and spawns the backend.
- `scripts/update-server.js` can serve files over HTTP.

For additional assurance, run `npm test` to execute any JavaScript unit tests.
