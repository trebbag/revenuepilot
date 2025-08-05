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

5. **Run the Electron shell**.  The project includes scripts to launch
   an Electron wrapper for development and to build distributable binaries:

   ```bash
   npm run electron:dev
   ```

   This command builds the frontend and starts Electron along with the Python
   backend so you can develop against the desktop shell.

   To create installers for macOS, Windows and Linux run:

   ```bash
   npm run electron:build
   ```

   `electron:build` downloads icon assets and bundles the backend.  Set the
   following environment variables before running it:

  * `OPENAI_API_KEY` – API key consumed by the backend.
  * `VITE_API_URL` – URL for the backend API, usually `http://localhost:8000`.
  * `ICON_PNG_URL`, `ICON_ICO_URL`, `ICON_ICNS_URL` – URLs for 256×256 PNG,
    Windows `.ico`, and macOS `.icns` icons.
  * `UPDATE_SERVER_URL` – feed URL for auto‑updates.  During development you
    can run `npm run update-server` to host the `dist/` directory and set
    `UPDATE_SERVER_URL=http://localhost:8080`.
  * Optional `CSC_LINK` and `CSC_KEY_PASSWORD` – signing certificate for
    Windows builds.

  The build script aborts if `UPDATE_SERVER_URL` is missing and warns when
  signing variables are not supplied.

### Update server

Run a minimal HTTP server to host built artifacts for auto‑update testing:

```bash
npm run update-server
```

This serves the `dist/` directory on port 8080.  Point
`UPDATE_SERVER_URL` at this URL when building.

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
   installer script (`install.sh`) automates most of this setup.

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

These steps will transform the scaffold into a fully operational clinical
documentation assistant.

This scaffold should give you a solid starting point for building the
RevenuePilot app with minimal setup.  Feel free to modify the palette
(`variables.css`) to match your chosen aesthetic.