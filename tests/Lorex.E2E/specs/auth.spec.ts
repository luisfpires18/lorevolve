import { expect, test } from '@playwright/test'
import { clickSignOut } from './support/account'

/**
 * Credentials here are obviously synthetic and only ever exist in the local development
 * database. The username is made unique per run so repeated runs stay deterministic
 * against a database that is not reset between them.
 */
const PASSWORD = 'Test-password-123!'

function newAccount() {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  const username = `testuser${suffix}`
  return { username, email: `${username}@example.test`, password: PASSWORD }
}

async function register(
  page: import('@playwright/test').Page,
  account: ReturnType<typeof newAccount>,
) {
  await page.goto('/register')
  await page.getByLabel('Username').fill(account.username)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

async function signIn(page: import('@playwright/test').Page, identifier: string) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(identifier)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('authentication', () => {
  test('register, reach the app, sign out, then sign back in', async ({ page }) => {
    const account = newAccount()

    await register(page, account)

    await expect(page).toHaveURL('/app')
    await expect(page.getByTestId('signed-in-user')).toHaveText(account.username)
    await expect(page.getByRole('heading', { name: 'Universes' })).toBeVisible()

    // Signing out is in the account menu, and the menu is the only place it is.
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

    await clickSignOut(page)
    await expect(page).toHaveURL('/login')

    // The protected route is closed once the session is gone.
    await page.goto('/app')
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await signIn(page, account.username)
    await expect(page).toHaveURL('/app')
    await expect(page.getByTestId('signed-in-user')).toHaveText(account.username)
  })

  test('signs in with the email address', async ({ page }) => {
    const account = newAccount()

    await register(page, account)
    await expect(page).toHaveURL('/app')

    await clickSignOut(page)
    await expect(page).toHaveURL('/login')

    await signIn(page, account.email)
    await expect(page).toHaveURL('/app')
    await expect(page.getByTestId('signed-in-user')).toHaveText(account.username)
  })

  test('rejects a wrong password without saying which part was wrong', async ({ page }) => {
    const account = newAccount()

    await register(page, account)
    await clickSignOut(page)
    // Signed out for certain before the form is used: going to /login while the sign-out is still in flight races it.
    await expect(page).toHaveURL('/login')

    await page.getByLabel('Username or email').fill(account.username)
    await page.getByLabel('Password', { exact: true }).fill('Not-the-password-9!')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByTestId('auth-error')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('sends anonymous visitors from the app to sign in', async ({ page }) => {
    await page.goto('/app')

    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('keeps signed-in people out of the sign-in screen', async ({ page }) => {
    const account = newAccount()

    await register(page, account)
    await expect(page).toHaveURL('/app')

    await page.goto('/login')
    await expect(page).toHaveURL('/app')
  })
})
