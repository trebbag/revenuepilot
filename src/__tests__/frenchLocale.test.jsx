/* @vitest-environment jsdom */
import { render, act } from '@testing-library/react';
import { expect, test } from 'vitest';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from '../i18n.js';

function Dummy() {
  const { t } = useTranslation();
  return <span>{t('app.beautify')}</span>;
}

test('renders beautify text in French', async () => {
  await act(async () => {
    await i18n.changeLanguage('fr');
  });
  const { getByText } = render(
    <I18nextProvider i18n={i18n}>
      <Dummy />
    </I18nextProvider>
  );
  expect(getByText('Embellir')).toBeTruthy();
});
