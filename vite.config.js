import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the RevenuePilot app. The React plugin enables
// fast refresh and JSX/TSX support.
export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : './', // relative paths in packaged build
  plugins: [react()],
  build: {
    outDir: 'electron/dist',
  },
}));