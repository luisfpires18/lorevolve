import { expect, test, type Page } from '@playwright/test'

/** The mark is the product's name, drawn as it is spoken: LorEvolve, at both sizes it is used. */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function expectTheMark(page: Page) {
  const mark = page.getByTestId('wordmark')
  await expect(mark).toBeVisible()

  await expect(mark).toHaveText('LorEvolve')
}

test.describe('wordmark', () => {
  test('the auth plate carries the large mark', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByTestId('wordmark')).toHaveClass(/wordmark--large/)
    await expectTheMark(page)
  })

  test('the home bar carries the same mark at bar size', async ({ page }) => {
    const username = unique('worldsmith')
    await page.goto('/register')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.test`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('/app')

    await expect(page.getByTestId('wordmark')).not.toHaveClass(/wordmark--large/)
    await expectTheMark(page)
  })
})
