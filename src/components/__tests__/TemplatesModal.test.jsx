/* @vitest-environment jsdom */
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, test, expect, afterEach } from 'vitest';
import '../../i18n.js';
import TemplatesModal from '../TemplatesModal.jsx';

vi.mock('../../api.js', () => ({
  getTemplates: vi.fn().mockResolvedValue([{ id: 1, name: 'Custom', content: 'C' }]),
  createTemplate: vi.fn(async (tpl) => ({ id: 2, ...tpl })),
  updateTemplate: vi.fn(async (id, tpl) => ({ id, ...tpl })),
  deleteTemplate: vi.fn(async () => {}),
}));
import * as api from '../../api.js';

afterEach(() => {
  cleanup();
});

test('lists and selects templates', async () => {
  const onSelect = vi.fn();
  const { getByText, findByText } = render(
    <TemplatesModal
      baseTemplates={[{ name: 'Base', content: 'B' }]}
      specialty="cardiology"
      onSelect={onSelect}
      onClose={() => {}}
    />,
  );
  await findByText('Custom');
  fireEvent.click(getByText('Base'));
  expect(onSelect).toHaveBeenCalledWith('B');
  expect(api.getTemplates).toHaveBeenCalledWith('cardiology');
});

test('creates template', async () => {
  const { getByPlaceholderText, getByText, findByText } = render(
    <TemplatesModal baseTemplates={[]} specialty="cardiology" onSelect={() => {}} onClose={() => {}} />,
  );
  fireEvent.change(getByPlaceholderText('Name'), { target: { value: 'Extra' } });
  fireEvent.change(getByPlaceholderText('Content'), { target: { value: 'X' } });
  fireEvent.click(getByText('Save'));
  await findByText('Extra');
});

test('edits and deletes template', async () => {
  const { getByText, getByPlaceholderText, findByText, queryByText } = render(
    <TemplatesModal baseTemplates={[]} specialty="cardiology" onSelect={() => {}} onClose={() => {}} />,
  );
  await findByText('Custom');
  fireEvent.click(getByText('Edit'));
  fireEvent.change(getByPlaceholderText('Name'), { target: { value: 'Edited' } });
  fireEvent.click(getByText('Save'));
  await findByText('Edited');
  fireEvent.click(getByText('Delete'));
  await waitFor(() => expect(queryByText('Edited')).toBeNull());
});
