/* @vitest-environment jsdom */
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';
import i18n from '../../i18n.js';

vi.mock('../../api.js', () => ({ setApiKey: vi.fn(), saveSettings: vi.fn() }));
import { saveSettings, setApiKey } from '../../api.js';
import Settings from '../Settings.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
});

test('saveSettings called when preferences change', async () => {
    const settings = {
      theme: 'modern',
      enableCodes: true,
      enableCompliance: true,
      enablePublicHealth: true,
      enableDifferentials: true,
      rules: [],
      lang: 'en',
      specialty: '',
      payer: '',
      region: '',

    };
  const updateSettings = vi.fn();
  const { getByLabelText } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  await fireEvent.click(getByLabelText('Show Codes & Rationale'));
  await waitFor(() => expect(saveSettings).toHaveBeenCalled());
});

test('renders Spanish translations when lang is es', () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'es',
    region: '',
  };
  i18n.changeLanguage('es');
  const { getAllByText } = render(
    <Settings settings={settings} updateSettings={() => {}} />
  );
  expect(getAllByText('Configuración').length).toBeGreaterThan(0);
  expect(getAllByText('Idioma').length).toBeGreaterThan(0);
});

test('changing language calls saveSettings with new lang', async () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'en',
    region: '',
  };
  const updateSettings = vi.fn();
  const { getByLabelText } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  await fireEvent.change(getByLabelText('Language'), {
    target: { value: 'es' },
  });
  await waitFor(() =>
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'es' })
    )
  );
  expect(updateSettings).toHaveBeenCalledWith(
    expect.objectContaining({ lang: 'es' })
  );
  expect(i18n.language).toBe('es');
});

test('setApiKey called when saving API key', async () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'en',
    region: '',
  };
  const { getAllByPlaceholderText, getAllByText } = render(
    <Settings settings={settings} updateSettings={() => {}} />
  );
  const input = getAllByPlaceholderText('sk-... (e.g., sk-proj-...)')[0];
  fireEvent.change(input, {
    target: { value: 'sk-' + 'a'.repeat(22) },
  });
  fireEvent.click(getAllByText('Save Key')[0]);
  await waitFor(() => expect(setApiKey).toHaveBeenCalled());
});
