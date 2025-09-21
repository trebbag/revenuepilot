import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reactConfig = {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
    globals: { ...globals.browser, ...globals.node },
  },
  plugins: {
    react: reactPlugin,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-unused-vars': 'off',
    'prefer-const': 'off',
  },
};

export default tseslint.config(
  {
    ignores: ['revenuepilot-frontend/src/**/__tests__/**'],
  },
  {
    files: ['revenuepilot-frontend/src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    ...reactConfig,
  },
  {
    files: ['revenuepilot-frontend/src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    ...reactConfig,
    rules: {
      ...reactConfig.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
