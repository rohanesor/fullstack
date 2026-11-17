import { expect, test } from '@playwright/test';
import { login, logout, raiseComplaint } from './helpers';

test('signed-out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong password shows a clear error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('College email').fill('student@campus.edu');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect');
});

test('a student cannot open another student\'s complaint or admin pages', async ({ page }) => {
  await login(page, 'student');
  const { id } = await raiseComplaint(page, `Hostel water ${Date.now()}`, 'No hot water in hostel block C for three days now.', 'Hostel C');
  await logout(page);
  await login(page, 'student2');
  await page.goto(`/complaints/${id}`);
  await expect(page.getByRole('heading', { name: 'Complaint not found' })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/student$/);
});

test('department staff only see complaints assigned to them', async ({ page }) => {
  await login(page, 'student');
  const { ref } = await raiseComplaint(page, `Unassigned issue ${Date.now()}`, 'Library Wi-Fi drops every few minutes on the second floor.', 'Library');
  await logout(page);
  await login(page, 'infra');
  await expect(page.getByRole('heading', { name: 'Assigned to your department' })).toBeVisible();
  await expect(page.locator(`[data-ref="${ref}"]`)).toHaveCount(0);   // not assigned yet
});

test('new complaint form explains what is missing', async ({ page }) => {
  await login(page, 'student');
  await page.getByRole('link', { name: '+ New complaint' }).click();
  await page.getByLabel('Title').fill('Hi');
  await page.getByLabel('What happened?').fill('too short');
  await page.getByRole('button', { name: 'Submit complaint' }).click();
  await expect(page.getByText('Give a short title (at least 4 characters).')).toBeVisible();
  await expect(page.getByText(/Describe the problem in at least 15 characters/)).toBeVisible();
  await expect(page).toHaveURL(/\/student\/new$/);
});

test('confidential complaints never reach department staff', async ({ page }) => {
  await login(page, 'student');
  await page.getByRole('link', { name: '+ New complaint' }).click();
  await page.getByLabel('Title').fill(`Private matter ${Date.now()}`);
  await page.getByLabel('What happened?').fill('A sensitive matter that should only be handled by administrators.');
  await page.getByText('Keep this confidential').click();
  await page.getByRole('button', { name: 'Submit complaint' }).click();
  const ref = (await page.getByTestId('created-ref').textContent())!.trim();
  await page.locator(`[data-ref="${ref}"]`).click();
  const id = page.url().split('/complaints/')[1];
  await logout(page);
  await login(page, 'admin');
  await page.goto(`/complaints/${id}`);
  await page.getByLabel('Confirmed category').selectOption({ label: 'Infrastructure' });
  await page.getByRole('button', { name: 'Confirm category' }).click();
  await page.getByRole('button', { name: 'Assign to department' }).click();
  await expect(page.locator('.badges [data-status="ASSIGNED"]')).toBeVisible();
  await logout(page);
  await login(page, 'infra');
  await page.goto(`/complaints/${id}`);
  await expect(page.getByRole('heading', { name: 'Complaint not found' })).toBeVisible();
});
