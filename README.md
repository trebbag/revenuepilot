# RevenuePilot App Skeleton

This directory contains a **minimal scaffold** for the RevenuePilot desktop application.
It is designed to reflect the approved wireframes (note editor with tabbed draft/beautified views
and a suggestion panel) and uses a clean, high‑contrast colour palette.  The scaffold is not
fully functional on its own—it requires you to install dependencies and wrap the React
app into an Electron shell for desktop deployment.

## Running locally

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

### Advanced PHI de-identification

The backend can optionally use machine-learning based scrubbers to remove names, dates, addresses, Social Security numbers and phone numbers from notes.
Install either [Microsoft Presidio](https://github.com/microsoft/presidio) or [Philter](https://github.com/Bitscopic/philter) and the backend will automatically use them when available.
If neither library is installed, a simpler regex-based scrubber is used instead.

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


The build check fails if any of the above variables are missing.

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
   events to a database, and wrap the app in Electron using
   `electron-builder` when you’re ready to distribute a desktop version.
   Remember to maintain HIPAA compliance by de‑identifying notes before
   sending them to any external API.

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