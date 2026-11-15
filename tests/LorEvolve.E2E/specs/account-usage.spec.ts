import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * The Profile's Usage section (ADR 0042) as a frame: what it holds, that it offers nothing to press, and how it reads
 * while loading, after a failed read and in both themes. Storage's own numbers are proved in
 * `account-storage.spec.ts`, and what counts is proved by the API tests. Stubbed responses are fictional numbers.
 *
 * The section held the web assistant's allowance beside Storage until M4 (issue #157) retired the assistant with its
 * `/api/profile/assistant-usage` reading, so Storage is the one allowance an account has.
 */

const storagePath = '**/api/profile/storage'
const GiB = 1024 * 1024 * 1024

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('usage')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** A storage body as the server sends it. */
function storageBody(usedBytes: number, quotaBytes = GiB) {
  return {
    usedBytes,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes),
    loreImagesBytes: usedBytes,
  }
}

test('one Usage section holds Storage, and offers nothing to press', async ({ page }) => {
  await signUp(page)
  await page.goto('/app/profile?tab=usage')

  const section = page.getByTestId('profile-usage')
  await expect(page.getByRole('heading', { level: 2, name: 'Usage' })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2, name: 'Storage' })).toHaveCount(0)
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Storage'])
  await expect(section.getByRole('meter')).toHaveCount(1)
  await expect(section.getByRole('meter', { name: 'Storage' })).toHaveAttribute(
    'aria-valuetext',
    '0 MB used of 1 GB, 0%',
  )
  // Read only: nothing to buy or raise, and no assistant allowance to read any more.
  await expect(section.getByRole('button')).toHaveCount(0)
  await expect(section.getByRole('link')).toHaveCount(0)
  await expect(section.getByTestId('usage-assistant')).toHaveCount(0)
})

test('loading is announced, and a failed read offers to try again', async ({ page }) => {
  await signUp(page)

  // Every read fails until Try again; the first ones wait, so the loading state can be seen.
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let failing = true
  await page.route(storagePath, async (route) => {
    if (failing) {
      await held
      await route.fulfill({ status: 500, json: { title: 'Synthetic failure' } })
    } else {
      await route.fulfill({ json: storageBody(300 * 1024 * 1024) })
    }
  })
  await page.goto('/app/profile?tab=usage')

  const item = page.getByTestId('profile-usage').getByTestId('usage-storage')
  await expect(item.getByRole('status')).toHaveText('Checking your usage…')
  await expect(item).toHaveAttribute('aria-busy', 'true')
  release()

  const error = item.getByTestId('usage-storage-error')
  await expect(error).toHaveRole('alert')
  await expect(error).toContainText("Your usage didn't load.")
  failing = false
  await error.getByRole('button', { name: 'Try again' }).click()

  await expect(item.getByTestId('usage-storage-amount')).toHaveText('300 MB used of 1 GB')
  await expect(item.getByRole('meter', { name: 'Storage' })).toHaveAttribute('aria-valuenow', '29')
  await expect(item).toHaveAttribute('aria-busy', 'false')
})

test('a full allowance says so in words', async ({ page }) => {
  await signUp(page)
  await page.route(storagePath, (route) => route.fulfill({ json: storageBody(GiB) }))
  await page.goto('/app/profile?tab=usage')

  const section = page.getByTestId('profile-usage')
  await expect(section.getByTestId('usage-storage-amount')).toHaveText('1 GB used of 1 GB')
  await expect(section.getByTestId('usage-storage-percent')).toHaveText('100%')
  await expect(section.getByTestId('usage-storage-full')).toHaveText(
    'Your storage is full. Remove some images to add new ones.',
  )
  await expect(section.getByRole('meter', { name: 'Storage' })).toHaveAttribute(
    'data-state',
    'full',
  )
})

for (const theme of ['light', 'dark'] as const) {
  for (const [device, width] of [
    ['desktop', 1280],
    ['phone', 390],
  ] as const) {
    test(`the Usage section reads in the ${theme} theme on a ${device}`, async ({ page }) => {
      await page.addInitScript((chosen) => localStorage.setItem('lorevolve-theme', chosen), theme)
      await page.setViewportSize({ width, height: 900 })
      await signUp(page)
      await page.route(storagePath, (route) =>
        route.fulfill({ json: storageBody(700 * 1024 * 1024) }),
      )
      await page.goto('/app/profile?tab=usage')

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const section = page.getByTestId('profile-usage')
      await expect(section.getByTestId('usage-storage-amount')).toHaveText('700 MB used of 1 GB')

      // The item sits inside the page, with nothing pushed sideways.
      const storage = (await section.getByTestId('usage-storage').boundingBox())!
      expect(storage.x).toBeGreaterThanOrEqual(0)
      expect(storage.x + storage.width).toBeLessThanOrEqual(width)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBe(0)

      // The fill is drawn in a theme colour, not left transparent.
      const fill = await section
        .getByTestId('usage-storage-meter')
        .locator('.progressbar__fill')
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(fill).not.toBe('rgba(0, 0, 0, 0)')
    })
  }
}
