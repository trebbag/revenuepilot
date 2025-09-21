# RevenuePilot Frontend Workspace

This workspace mirrors the production React application located under
`../src/`. It exists so designers and frontend engineers can iterate with
Vite independently of the Electron/Node packaging scripts.

## Quick start

```bash
npm install
npm run dev
```

The dev server will serve the UI on `http://localhost:5173`. Set
`VITE_API_URL` to point at a running backend (defaults to
`http://127.0.0.1:8000`). The workspace shares tests, components and
translations with the main application.

For a full description of the product surface, development workflow and
available scripts, read the consolidated documentation in
[`../docs/README.md`](../docs/README.md).
