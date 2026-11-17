import { expect, test } from '@playwright/test';
import { login, raiseComplaint } from './helpers';

test('student can raise and track a complaint on a phone, without sideways scrolling', async ({ page }) => {
  await login(page, 'student');
  const { ref } = await raiseComplaint(page, `Mess food ${Date.now()}`, 'The mess served undercooked rice at dinner on two days this week.', 'Hostel mess');
  await expect(page.getByText(ref)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
