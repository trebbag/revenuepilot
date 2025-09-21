import { defineConfig, defaultExclude } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrcDir = path.resolve(__dirname, 'revenuepilot-frontend', 'src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': frontendSrcDir,
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...defaultExclude, 'e2e/**'],
    testTimeout: 10000,
    coverage: {
      enabled: true,
      reporter: ['text', 'json-summary'],
      include: [
        'src/components/ClipboardExportButtons.jsx',
        'src/components/Dashboard.jsx',
        'src/components/Login.jsx',
        'src/components/__tests__/Login.unified.test.jsx',
        'src/components/NoteEditor.jsx',
        'src/components/Settings.jsx',
        'src/components/Sidebar.jsx',
        'src/components/SuggestionPanel.jsx',
        'src/components/TemplatesModal.jsx'
      ],
      lines: 90,
      functions: 90,
      branches: 80,
      statements: 80,
    },
  },
});
