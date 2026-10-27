import { expect, test, type Page } from '@playwright/test'

/**
 * The mark is drawn "Lore X" and spoken "LorEvolve".
 *
 * Both halves are asserted, at both sizes it is used. The split is a typographic
 * treatment and not a rename: nothing about the product's name changed, so the accessible
 * name has to keep saying so even though the drawn letters no longer spell it.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function expectTheMark(page: Page) {
  const mark = page.getByTestId('wordmark')
  await expect(mark).toBeVisible()

  // Drawn: "Lore" and an X, parted by a set gap rather than by a space character.
  await expect(mark.locator('[aria-hidden="true"]')).toHaveText('LorEvolve')
  await expect(mark.locator('.wordmark__x')).toHaveText('X')

  // Spoken: still LorEvolve, which is what assistive technology and the product both use.
  await expect(mark.locator('.wordmark__name')).toHaveText('LorEvolve')

  // The X takes the accent. Which accent depends on the surface, so compare rather than
  // pin a colour: what matters is that the X is not painted in the surrounding ink.
  const ink = await mark.evaluate((node) => getComputedStyle(node).color)
  const accent = await mark.locator('.wordmark__x').evaluate((node) => getComputedStyle(node).color)
  expect(accent).not.toBe(ink)
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
