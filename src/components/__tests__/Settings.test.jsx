/* @vitest-environment jsdom */
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { vi, expect, test, beforeEach, afterEach } from 'vitest';
import i18n from '../../i18n.js';

vi.mock('../../api.js', () => ({
  setApiKey: vi.fn(),
  saveSettings: vi.fn(async (s) => s),
  getTemplates: vi.fn().mockResolvedValue([]),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getPromptTemplates: vi.fn().mockResolvedValue({}),
  savePromptTemplates: vi.fn(),
}));
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
      summaryLang: 'en',
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
    summaryLang: 'en',
    specialty: '',
    payer: '',
    region: '',
  };
  const updateSettings = vi.fn();
  const { getAllByRole } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  const selects = getAllByRole('combobox');
  // selects[0] is language, [1] summary language, [2] specialty, [3] payer
  fireEvent.change(selects[2], { target: { value: 'cardiology' } });
  fireEvent.change(selects[3], { target: { value: 'medicare' } });
  await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
});

test('changing region triggers saveSettings', async () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'en',
    summaryLang: 'en',
    specialty: '',
    payer: '',
    region: '',
  };
  const updateSettings = vi.fn();
  const { getByPlaceholderText } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  fireEvent.change(getByPlaceholderText('e.g., US'), { target: { value: 'US' } });
  await waitFor(() => expect(saveSettings).toHaveBeenCalled());
  expect(updateSettings).toHaveBeenCalledWith(
    expect.objectContaining({ region: 'US' })
  );
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
    summaryLang: 'es',
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
    summaryLang: 'en',
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

test('changing summary language calls saveSettings with new summaryLang', async () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'en',
    summaryLang: 'en',
    region: '',
  };
  const updateSettings = vi.fn();
  const { getByLabelText } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  await fireEvent.change(getByLabelText('Summary language'), {
    target: { value: 'es' },
  });
  await waitFor(() =>
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ summaryLang: 'es' })
    )
  );
  expect(updateSettings).toHaveBeenCalledWith(
    expect.objectContaining({ summaryLang: 'es' })
  );
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
    summaryLang: 'en',
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

test('invalid API key shows error and does not call setApiKey', async () => {
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
  const { getAllByPlaceholderText, getByText, getAllByText } = render(
    <Settings settings={settings} updateSettings={() => {}} />,
  );
  const input = getAllByPlaceholderText('sk-... (e.g., sk-proj-...)')[0];
  fireEvent.change(input, {
    target: { value: 'invalid-key' },
  });
  fireEvent.click(getAllByText('Save Key')[0]);
  await waitFor(() => expect(setApiKey).not.toHaveBeenCalled());
  await waitFor(() => {
    expect(getByText('Invalid API key format')).toBeTruthy();
  });
});

test('changing theme triggers saveSettings', async () => {
  const settings = {
    theme: 'modern',
    enableCodes: true,
    enableCompliance: true,
    enablePublicHealth: true,
    enableDifferentials: true,
    rules: [],
    lang: 'en',
    summaryLang: 'en',
    region: '',
  };
  const updateSettings = vi.fn();
  const { getByLabelText } = render(
    <Settings settings={settings} updateSettings={updateSettings} />
  );
  await fireEvent.click(getByLabelText('Dark Elegance'));
  await waitFor(() => expect(saveSettings).toHaveBeenCalled());
  expect(updateSettings).toHaveBeenCalledWith(
    expect.objectContaining({ theme: 'dark' })
  );
});
