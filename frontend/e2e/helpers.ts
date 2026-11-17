import { expect, Page } from '@playwright/test';

export const PASSWORD = 'Campus@2026';
export const USERS = {
  student: 'student@campus.edu', student2: 'student2@campus.edu', teacher: 'teacher@campus.edu', admin: 'admin@campus.edu',
  infra: 'infra.staff@campus.edu', hostel: 'hostel.staff@campus.edu',
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto('/login');
  await page.getByLabel('College email').fill(USERS[who]);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Student raises a complaint through the UI; returns its reference code and id. */
export async function raiseComplaint(page: Page, title: string, description: string, location = 'Block B, Room 204') {
  await page.getByRole('link', { name: '+ New complaint' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('What happened?').fill(description);
  await page.getByLabel('Location (optional)').fill(location);
  await page.getByRole('button', { name: 'Submit complaint' }).click();
  const ref = (await page.getByTestId('created-ref').textContent())!.trim();
  expect(ref).toMatch(/^CR-\d{4}-[0-9A-F]{6}$/);
  await page.locator(`[data-ref="${ref}"]`).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const id = page.url().split('/complaints/')[1];
  return { ref, id };
}
