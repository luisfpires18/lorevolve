import { expect, test } from '@playwright/test'

/**
 * Forgot password (#69), as far as a test host without email can go: the sign-in page leads to it, any address gets the
 * same answer, and the reset page refuses a missing or wrong link with a way to ask again. A working link and its reset
 * are covered by the API's `PasswordResetTests`, which read the email the link is in.
 */

test('the sign-in page leads to forgot password, and any address gets the same answer', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByTestId('forgot-password-link').click()
  await page.waitForURL('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()

  await page.getByLabel('Email').fill('not an address')
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()

  await page.getByLabel('Email').fill('insert.an.address@example.test')
  await page.getByRole('button', { name: 'Send the link' }).click()
  await expect(page.getByTestId('forgot-sent')).toContainText(
    'If insert.an.address@example.test has a LorEvolve account',
  )

  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await page.waitForURL('/login')
})

test('the reset page needs the email link, and a wrong one says to ask again', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByTestId('reset-link-missing')).toBeVisible()

  await page.goto('/reset-password?user=nobody&token=not-a-token')
  await page.getByLabel('New password', { exact: true }).fill('insert-a-pass-1')
  await page.getByLabel('Confirm new password').fill('insert-a-pass-2')
  await page.getByRole('button', { name: 'Save the new password' }).click()
  await expect(page.getByText('Both passwords need to match.')).toBeVisible()

  await page.getByLabel('Confirm new password').fill('insert-a-pass-1')
  await page.getByRole('button', { name: 'Save the new password' }).click()
  await expect(page.getByTestId('auth-error')).toContainText('This link is no longer valid.')
  await page.getByTestId('auth-error').getByRole('link', { name: 'Ask again' }).click()
  await page.waitForURL('/forgot-password')
})
