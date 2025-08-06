/* @vitest-environment jsdom */
import { render, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect, test, beforeEach } from 'vitest';
import i18n from '../../i18n.js';

vi.mock('../../api.js', () => ({ setApiKey: vi.fn(), saveSettings: vi.fn() }));
import { saveSettings, setApiKey } from '../../api.js';
import Settings from '../Settings.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  i18n.changeLanguage('en');
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

test('saveSettings called when specialty and payer change', async () => {
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
  const { getAllByRole } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  const selects = getAllByRole('combobox');
  // selects[0] is language, [1] specialty, [2] payer
  fireEvent.change(selects[1], { target: { value: 'cardiology' } });
  fireEvent.change(selects[2], { target: { value: 'medicare' } });
  await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
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
