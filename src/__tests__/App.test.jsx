/* @vitest-environment jsdom */
import { render } from '@testing-library/react';
import { test, expect } from 'vitest';
import '../i18n.js';
import App from '../App.jsx';

test('renders login form when no token', () => {
  localStorage.clear();
  const { getByLabelText } = render(<App />);
  expect(getByLabelText(/username/i)).toBeTruthy();
});
