import { expect, test } from '@playwright/test';
import { login, logout, raiseComplaint } from './helpers';

// The core journey from the plan's definition of done:
// student submits -> admin confirms category and assigns -> department works and resolves -> student sees it -> admin closes.
test.describe.configure({ mode: 'serial' });

test('complaint travels from student to department and back, with a full audit trail', async ({ page }) => {
  const title = `Projector broken ${Date.now()}`;
  await login(page, 'student');
  const { ref, id } = await raiseComplaint(page, title, 'The projector in room B204 has not turned on for a week, so lectures run without slides.');
  await expect(page.locator('.badges [data-status="SUBMITTED"]')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Progress' }).locator('[aria-current="step"]')).toContainText('Submitted');
  await logout(page);

  // ---- teacher/coordinator reviews, confirms category (no ML model configured -> manual), assigns
  await login(page, 'teacher');
  await page.getByRole('searchbox', { name: 'Search' }).fill(ref);
  await page.locator(`[data-ref="${ref}"]`).click();
  await expect(page.getByTestId('no-prediction')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign to department' })).toBeDisabled();
  await page.getByLabel('Confirmed category').selectOption({ label: 'Infrastructure' });
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByRole('button', { name: 'Confirm category' }).click();
  await expect(page.getByText('Category confirmed.')).toBeVisible();
  await expect(page.getByLabel('Department')).toHaveValue(/.+/);                       // pre-filled from the category's default
  await expect(page.getByLabel('Department').locator('option:checked')).toHaveText('Estate & Infrastructure');
  await page.getByRole('button', { name: 'Assign to department' }).click();
  await expect(page.locator('.badges [data-status="ASSIGNED"]')).toBeVisible();
  await expect(page.locator('.badges')).toContainText('High');
  await logout(page);

  // ---- a different department cannot see it
  await login(page, 'hostel');
  await page.goto(`/complaints/${id}`);
  await expect(page.getByRole('heading', { name: 'Complaint not found' })).toBeVisible();
  await logout(page);

  // ---- infrastructure staff start work, add an internal note, resolve
  await login(page, 'infra');
  await page.locator(`[data-ref="${ref}"]`).click();
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByLabel(/What are you doing first/).fill('Technician assigned, visiting today.');
  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.locator('.badges [data-status="IN_PROGRESS"]')).toBeVisible();
  await page.getByLabel('Add a remark').fill('Vendor quote pending for a new lamp.');
  await page.getByLabel('Internal only').check();
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.locator('[data-internal]')).toContainText('Vendor quote pending');
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await page.getByLabel(/What was done to fix it/).fill('Lamp replaced and projector tested.');
  await page.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(page.locator('.badges [data-status="RESOLVED"]')).toBeVisible();
  await logout(page);

  // ---- student sees the resolution but never the internal note
  await login(page, 'student');
  await page.locator(`[data-ref="${ref}"]`).click();
  await expect(page.locator('.badges [data-status="RESOLVED"]')).toBeVisible();
  await expect(page.getByText('Lamp replaced and projector tested.')).toBeVisible();
  await expect(page.getByText('Vendor quote pending')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Not fixed — reopen' })).toBeVisible();
  await logout(page);

  // ---- teacher/coordinator closes it; timeline shows every step
  await login(page, 'teacher');
  await page.goto(`/complaints/${id}`);
  await page.getByRole('button', { name: 'Close complaint' }).click();
  await page.getByLabel('Closing note').fill('Confirmed with the class representative.');
  await page.getByRole('button', { name: 'Close complaint' }).click();
  await expect(page.locator('.badges [data-status="CLOSED"]')).toBeVisible();
  const tl = page.getByRole('list', { name: 'Timeline' });
  for (const step of ['Submitted', 'Submitted → Assigned', 'Assigned → In progress', 'In progress → Resolved', 'Resolved → Closed']) await expect(tl).toContainText(step);
});

test('student can reopen a resolved complaint', async ({ page }) => {
  await login(page, 'student');
  const { ref, id } = await raiseComplaint(page, `Bus late ${Date.now()}`, 'Route 7 bus has arrived 40 minutes late every morning this week.', 'Route 7');
  await logout(page);
  await login(page, 'teacher');
  await page.goto(`/complaints/${id}`);
  await page.getByLabel('Confirmed category').selectOption({ label: 'Transport' });
  await page.getByRole('button', { name: 'Confirm category' }).click();
  await page.getByRole('button', { name: 'Assign to department' }).click();
  await expect(page.locator('.badges [data-status="ASSIGNED"]')).toBeVisible();
  await logout(page);
  // staff resolve via API to keep this test focused on the reopen path
  const api = page.request;
  const tok = (await (await api.post('/api/v1/auth/login', { data: { email: 'transport.staff@campus.edu', password: 'Campus@2026' } })).json()).access_token;
  for (const to of ['IN_PROGRESS', 'RESOLVED']) {
    const r = await api.post(`/api/v1/staff/complaints/${id}/transitions`, { data: { to_status: to, remark: 'Driver schedule changed' }, headers: { Authorization: `Bearer ${tok}` } });
    expect(r.ok()).toBeTruthy();
  }
  await login(page, 'student');
  await page.locator(`[data-ref="${ref}"]`).click();
  await page.getByRole('button', { name: 'Not fixed — reopen' }).click();
  await page.getByLabel('What is still wrong?').fill('Still 30 minutes late today.');
  await page.getByRole('button', { name: 'Not fixed — reopen' }).click();
  await expect(page.locator('.badges [data-status="IN_PROGRESS"]')).toBeVisible();
});
