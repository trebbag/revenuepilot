
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';
  import { createRequire } from 'module';

  const require = createRequire(import.meta.url);
  const resolveModule = (specifier: string) => require.resolve(specifier);

  export default defineConfig({
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'vaul@1.1.2': resolveModule('vaul'),
        'sonner@2.0.3': resolveModule('sonner'),
        'recharts@2.15.2': resolveModule('recharts'),
        'react-resizable-panels@2.1.7': resolveModule('react-resizable-panels'),
        'react-hook-form@7.55.0': resolveModule('react-hook-form'),
        'react-day-picker@8.10.1': resolveModule('react-day-picker'),
        'next-themes@0.4.6': resolveModule('next-themes'),
        'lucide-react@0.487.0': resolveModule('lucide-react'),
        'input-otp@1.4.2': resolveModule('input-otp'),
        'embla-carousel-react@8.6.0': resolveModule('embla-carousel-react'),
        'cmdk@1.1.1': resolveModule('cmdk'),
        'class-variance-authority@0.7.1': resolveModule('class-variance-authority'),
        'clsx': resolveModule('clsx'),
        'tailwind-merge': resolveModule('tailwind-merge'),
        '@radix-ui/react-tooltip@1.1.8': resolveModule('@radix-ui/react-tooltip'),
        '@radix-ui/react-toggle@1.1.2': resolveModule('@radix-ui/react-toggle'),
        '@radix-ui/react-toggle-group@1.1.2': resolveModule('@radix-ui/react-toggle-group'),
        '@radix-ui/react-tabs@1.1.3': resolveModule('@radix-ui/react-tabs'),
        '@radix-ui/react-switch@1.1.3': resolveModule('@radix-ui/react-switch'),
        '@radix-ui/react-slot@1.1.2': resolveModule('@radix-ui/react-slot'),
        '@radix-ui/react-slider@1.2.3': resolveModule('@radix-ui/react-slider'),
        '@radix-ui/react-separator@1.1.2': resolveModule('@radix-ui/react-separator'),
        '@radix-ui/react-select@2.1.6': resolveModule('@radix-ui/react-select'),
        '@radix-ui/react-scroll-area@1.2.3': resolveModule('@radix-ui/react-scroll-area'),
        '@radix-ui/react-radio-group@1.2.3': resolveModule('@radix-ui/react-radio-group'),
        '@radix-ui/react-progress@1.1.2': resolveModule('@radix-ui/react-progress'),
        '@radix-ui/react-popover@1.1.6': resolveModule('@radix-ui/react-popover'),
        '@radix-ui/react-navigation-menu@1.2.5': resolveModule('@radix-ui/react-navigation-menu'),
        '@radix-ui/react-menubar@1.1.6': resolveModule('@radix-ui/react-menubar'),
        '@radix-ui/react-label@2.1.2': resolveModule('@radix-ui/react-label'),
        '@radix-ui/react-hover-card@1.1.6': resolveModule('@radix-ui/react-hover-card'),
        '@radix-ui/react-dropdown-menu@2.1.6': resolveModule('@radix-ui/react-dropdown-menu'),
        '@radix-ui/react-dialog@1.1.6': resolveModule('@radix-ui/react-dialog'),
        '@radix-ui/react-context-menu@2.2.6': resolveModule('@radix-ui/react-context-menu'),
        '@radix-ui/react-collapsible@1.1.3': resolveModule('@radix-ui/react-collapsible'),
        '@radix-ui/react-checkbox@1.1.4': resolveModule('@radix-ui/react-checkbox'),
        '@radix-ui/react-avatar@1.1.3': resolveModule('@radix-ui/react-avatar'),
        '@radix-ui/react-aspect-ratio@1.1.2': resolveModule('@radix-ui/react-aspect-ratio'),
        '@radix-ui/react-alert-dialog@1.1.6': resolveModule('@radix-ui/react-alert-dialog'),
        '@radix-ui/react-accordion@1.2.3': resolveModule('@radix-ui/react-accordion'),
        '@': path.resolve(__dirname, './src'),
        'finalization-wizard': path.resolve(__dirname, '../finalization-wizard/src'),
        'motion/react': resolveModule('motion/react'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
    },
    server: {
      port: 3000,
      open: true,
    },
  });
