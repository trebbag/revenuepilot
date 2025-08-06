import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      reporter: ['text'],
      include: [
        'src/components/ClipboardExportButtons.jsx',
        'src/components/Dashboard.jsx',
        'src/components/Login.jsx',
        'src/components/NoteEditor.jsx',
        'src/components/Settings.jsx',
        'src/components/Sidebar.jsx',
        'src/components/SuggestionPanel.jsx',
        'src/components/TemplatesModal.jsx'
      ],
    },
  },
});
