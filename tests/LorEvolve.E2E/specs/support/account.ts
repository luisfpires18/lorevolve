import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

/**
 * Reaching the account through the menu that holds it, wherever that menu is on screen.
 *
 * There is one account menu in LorEvolve and it is the same component in all three places it appears -
 * the workspace's black rail, that rail folded into the mobile bar, and the universes header - so
 * these helpers do not care which screen is open. That is the point of them: a spec that needs a
 * different account says so once, and nothing in it depends on where the control happens to live.
 *
 * Not a spec.
 */

/** Opens the account menu and waits for its panel. */
export async function openAccountMenu(page: Page) {
  const trigger = page.getByTestId('account-menu-trigger')
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByTestId('account-menu-panel')).toBeVisible()
}

/**
 * Signs out through the menu. Leaves the wait for `/login` to the caller, which is what every
 * call site already had.
 */
export async function clickSignOut(page: Page) {
  await openAccountMenu(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
}

/**
 * A throwaway password for an account a test creates, made at run time so no credential-shaped literal sits in the
 * repository for a secret scanner to flag. The prefix meets LorEvolve's rules (a digit, a lowercase letter, eight or more
 * characters) whatever the random part turns out to be. Reuse the one value for an account's register and sign-in.
 */
export function makeTestPassword() {
  return `e2e-${crypto.randomUUID()}`
}

/**
 * How the running version should read, from the one place it is written: the web app's package.json. Read here
 * rather than copied, so bumping the version never means editing a test.
 */
export function expectedVersionLabel() {
  const pkg = JSON.parse(
    readFileSync(new URL('../../../../src/LorEvolve.Web/package.json', import.meta.url), 'utf8'),
  ) as { version: string }
  return `LorEvolve v${pkg.version}`
}
