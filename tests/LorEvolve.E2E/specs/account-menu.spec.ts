import { expect, test, type Page } from '@playwright/test'
import { expectedVersionLabel, makeTestPassword, openAccountMenu } from './support/account'
import { png } from './support/png'

/**
 * The account, and where it is reached from.
 *
 * One claim carries this file: there is exactly one account menu in LorEvolve, it is on the global
 * chrome rather than inside a universe, and it agrees with the Profile screen about what the
 * person looks like. So the tests here check the two surfaces it appears on and the one it must
 * not - the universe's sidebar, which is that universe's sections and nothing else - rather than
 * re-proving what the menu does once per screen.
 *
 * The avatar is checked by `data-avatar`, which says whether a real photo or the monogram is
 * being drawn. That is the one thing worth asserting: which of the two the menu chose. What the
 * photo looks like is `profile.spec.ts`'s business.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('menuser')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url()
}

/** Uploads a photo through the Profile screen, keeping whatever square the cropper opens on. */
async function uploadPhoto(page: Page) {
  await page.goto('/app/profile')
  await page.getByTestId('profile-photo-input').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: png(400, 400, () => [40, 90, 160]),
  })
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  await dialog.getByTestId('image-crop-confirm').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('profile-avatar')).toHaveAttribute('data-avatar', 'photo')
}

test.describe('the account menu', () => {
  test('is on the global rail and not in a universe sidebar', async ({ page }) => {
    await signUp(page)
    await newUniverse(page)

    // The sidebar is this universe's sections. The account is not one of them.
    const sidebar = page.locator('.sidebar')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByText('Profile', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('workspace-profile')).toHaveCount(0)

    // It is on the black rail, which is the chrome that is not about any one world.
    const trigger = page.getByTestId('account-menu-trigger')
    await expect(page.locator('.rail').getByTestId('account-menu-trigger')).toHaveCount(1)
    await expect(trigger).toHaveAttribute('aria-label', 'Open account menu')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // The "L" and the universe's accent seal are still a pair, undisturbed.
    await expect(page.locator('.rail__mark')).toBeVisible()
    await expect(page.locator('.rail__seal')).toHaveCount(1)

    await openAccountMenu(page)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('link', { name: 'Profile', exact: true }).click()
    await expect(page).toHaveURL('/app/profile')
  })

  test('is the same menu in the universes header, and the only way out', async ({ page }) => {
    const username = await signUp(page)

    // The loose username and Sign out button are gone: the menu carries both.
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(page.getByTestId('signed-in-user')).toHaveText(username)

    await openAccountMenu(page)

    // Context at the top, so the menu says whose account it is before offering to leave it.
    const panel = page.getByTestId('account-menu-panel')
    await expect(panel).toContainText(username)
    await expect(panel).toContainText(`${username}@example.test`)

    // The running version, last and quiet: text to read, not a thing to press.
    const version = page.getByTestId('account-menu-version')
    await expect(version).toHaveText(expectedVersionLabel())
    expect(await version.evaluate((node) => node.tagName)).toBe('P')
    await expect(version.locator('a, button')).toHaveCount(0)
    await expect(panel.getByRole('link', { name: expectedVersionLabel() })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: expectedVersionLabel() })).toHaveCount(0)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')

    // Signed out, there is no account and no menu.
    await expect(page.getByTestId('account-menu')).toHaveCount(0)
  })

  test('shows the real photo once there is one, and the monogram once there is not', async ({
    page,
  }) => {
    await signUp(page)
    const workspace = await newUniverse(page)

    // Before any photo: the rail carries the initial.
    await expect(page.getByTestId('account-menu-trigger').locator('[data-avatar]')).toHaveAttribute(
      'data-avatar',
      'monogram',
    )

    await uploadPhoto(page)

    // The page that did the writing is not the only thing that changed: the header beside it
    // already shows the photo, with no reload.
    const avatarIn = (of: Page) => of.getByTestId('account-menu-trigger').locator('[data-avatar]')
    await expect(avatarIn(page)).toHaveAttribute('data-avatar', 'photo')

    // And so does the workspace rail, which is a different screen reading the same state.
    await page.goto(workspace)
    await expect(avatarIn(page)).toHaveAttribute('data-avatar', 'photo')

    // Taking it away puts every one of them back to the monogram, again without a reload.
    await page.goto('/app/profile')
    await page.getByTestId('profile-photo-remove').click()
    await expect(page.getByTestId('profile-avatar')).toHaveAttribute('data-avatar', 'monogram')
    await expect(avatarIn(page)).toHaveAttribute('data-avatar', 'monogram')

    await page.goto(workspace)
    await expect(avatarIn(page)).toHaveAttribute('data-avatar', 'monogram')
  })

  test('opens from the keyboard, closes on Escape, and closes on a press outside', async ({
    page,
  }) => {
    await signUp(page)

    const trigger = page.getByTestId('account-menu-trigger')
    const panel = page.getByTestId('account-menu-panel')

    // Reached and opened without a pointer.
    await trigger.focus()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()

    // Focus went into the panel - onto its first place - so the keyboard is not left behind the trigger it just pressed.
    await expect(page.getByRole('link', { name: 'My workspace' })).toBeFocused()

    // Escape closes it and hands focus back.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // A press anywhere else closes it too, and does not need the trigger.
    await openAccountMenu(page)
    await page.getByRole('heading', { name: 'Universes' }).click()
    await expect(panel).toHaveCount(0)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('is reachable in the folded workspace bar, and opens inside the screen', async ({
      page,
    }) => {
      await signUp(page)
      await newUniverse(page)

      // The rail is the sticky bar here, and the same menu is in it - not a second account UI.
      const trigger = page.getByTestId('account-menu-trigger')
      await expect(page.locator('.rail').getByTestId('account-menu-trigger')).toHaveCount(1)
      await expect(trigger).toBeVisible()

      await trigger.tap()
      const panel = page.getByTestId('account-menu-panel')
      await expect(panel).toBeVisible()

      // Open, and wholly on the screen.
      const box = (await panel.boundingBox())!
      const viewport = page.viewportSize()!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `the bar scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)

      await page.getByRole('link', { name: 'Profile', exact: true }).click()
      await expect(page).toHaveURL('/app/profile')
    })
  })
})
