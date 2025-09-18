
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'FinalizationWizard',
        fileName: 'index',
        formats: ['es'],
      },
      rollupOptions: {
        external: ['react', 'react-dom'],
      },
      sourcemap: true,
    },
    server: {
      port: 3000,
      open: true,
    },
  });

