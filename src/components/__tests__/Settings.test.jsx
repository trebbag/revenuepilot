/* @vitest-environment jsdom */
import { render, fireEvent, waitFor } from '@testing-library/react';
import { vi, expect, test, beforeEach } from 'vitest';
import i18n from '../../i18n.js';

vi.mock('../../api.js', () => ({ setApiKey: vi.fn(), saveSettings: vi.fn() }));
import { saveSettings } from '../../api.js';
import Settings from '../Settings.jsx';

beforeEach(() => {
  vi.clearAllMocks();
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
  };
  i18n.changeLanguage('es');
  const { getAllByText } = render(
    <Settings settings={settings} updateSettings={() => {}} />
  );
  expect(getAllByText('Configuración').length).toBeGreaterThan(0);
  expect(getAllByText('Idioma').length).toBeGreaterThan(0);
});
