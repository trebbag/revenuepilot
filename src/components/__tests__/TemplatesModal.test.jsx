/* @vitest-environment jsdom */
import { render, fireEvent, cleanup } from '@testing-library/react';
import { vi, test, expect, afterEach } from 'vitest';
import TemplatesModal from '../TemplatesModal.jsx';

vi.mock('../../api.js', () => ({
  getTemplates: vi.fn().mockResolvedValue([{ id: 1, name: 'Custom', content: 'C' }]),
  createTemplate: vi.fn(async (tpl) => ({ id: 2, ...tpl })),
}));

afterEach(() => {
  cleanup();
});

test('lists and selects templates', async () => {
  const onSelect = vi.fn();
  const { getByText, findByText } = render(
    <TemplatesModal
      baseTemplates={[{ name: 'Base', content: 'B' }]}
      onSelect={onSelect}
      onClose={() => {}}
    />,
  );
  await findByText('Custom');
  fireEvent.click(getByText('Base'));
  expect(onSelect).toHaveBeenCalledWith('B');
});

test('creates template', async () => {
  const { getByPlaceholderText, getByText, findByText } = render(
    <TemplatesModal baseTemplates={[]} onSelect={() => {}} onClose={() => {}} />,
  );
  fireEvent.change(getByPlaceholderText('Name'), { target: { value: 'Extra' } });
  fireEvent.change(getByPlaceholderText('Content'), { target: { value: 'X' } });
  fireEvent.click(getByText('Save'));
  await findByText('Extra');
});
