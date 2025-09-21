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
        'revenuepilot-frontend/src/**/*.{js,jsx,ts,tsx}',
        'src/**/*.{js,jsx,ts,tsx}',
      ],
      reportsDirectory: path.resolve(__dirname, 'coverage'),
      lines: 90,
      functions: 90,
      branches: 80,
      statements: 80,
    },
  },
});
