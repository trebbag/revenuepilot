import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility regression', () => {
  test('login screen has no WCAG AA violations', async ({ page }) => {
    await page.request.post('http://127.0.0.1:4010/__mock__/auth/state', {
      data: { authenticated: false },
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
