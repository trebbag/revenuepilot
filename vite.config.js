import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadConfigFromFile, mergeConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, 'revenuepilot-frontend');
const frontendConfigPath = path.join(frontendRoot, 'vite.config.ts');

export default defineConfig(async ({ command, mode }) => {
  const { config: workspaceConfig = {} } = await loadConfigFromFile(
    { command, mode },
    frontendConfigPath
  );

  const resolvedWorkspaceConfig =
    typeof workspaceConfig === 'function'
      ? await workspaceConfig({ command, mode })
      : workspaceConfig;

  return mergeConfig(resolvedWorkspaceConfig, {
    root: frontendRoot,
    base: command === 'serve' ? '/' : './',
    build: {
      ...(resolvedWorkspaceConfig.build ?? {}),
      outDir: path.resolve(__dirname, 'electron', 'dist'),
      emptyOutDir: true,
    },
  });
});