import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * The Profile's Usage section (ADR 0042, 0045): Storage, then the account's AI Assistant allowance as the server counts
 * it. Storage's own numbers are proved in `account-storage.spec.ts`. What counts, the
 * window, and that one account never sees another's are proved by the API tests; this proves that the server's numbers
 * reach the screen in words and as a meter, that asking updates them without reloading the app, and that the loading,
 * full and failed states read properly on a desktop and a phone. Stubbed responses are fictional numbers.
 */

const usagePath = '**/api/profile/assistant-usage'
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

async function newUniverse(page: Page) {
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Usage World '), description: null, accentColor: null },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

function assistantUsage(page: Page) {
  return page.getByTestId('profile-usage').getByTestId('usage-assistant')
}

async function expectUsage(page: Page, used: number, percent: number, left: string) {
  const item = assistantUsage(page)
  await expect(item.getByTestId('usage-assistant-amount')).toHaveText(
    `${used} of 10 questions used`,
  )
  await expect(item.getByTestId('usage-assistant-percent')).toHaveText(`${percent}%`)
  await expect(item.getByTestId('usage-assistant-left')).toHaveText(left)
  const meter = item.getByRole('meter', { name: 'Questions' })
  await expect(meter).toHaveAttribute('aria-valuenow', `${percent}`)
  await expect(meter).toHaveAttribute('aria-valuetext', `${used} of 10 questions used, ${percent}%`)
}

/** A usage body as the server sends it: `used` questions, no change requests. */
function usageBody(used: number, resetsAt: Date | null = null) {
  return {
    ask: { used, limit: 10, remaining: 10 - used, resetsAt },
    propose: { used: 0, limit: 5, remaining: 5, resetsAt: null },
    windowSeconds: 3600,
  }
}

function stubUsage(page: Page, body: object) {
  return page.route(usagePath, (route) => route.fulfill({ json: body }))
}

test('a new account has its whole allowance, and asking counts without reloading the app', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/app/profile?tab=usage')

  const section = page.getByTestId('profile-usage')
  await expect(section.getByRole('heading', { level: 2, name: 'Usage' })).toBeVisible()
  await expect(section.getByRole('heading', { level: 3, name: 'AI Assistant' })).toBeVisible()
  await expectUsage(page, 0, 0, '10 questions left')
  await expect(section).toContainText('One counts even when the answer fails.')
  // Read only: nothing to buy or raise.
  await expect(section.getByRole('button')).toHaveCount(0)
  await expect(section.getByRole('link')).toHaveCount(0)

  // One answered question through the drawer, then back to the Profile through the account menu: same app, no reload.
  const universeId = await newUniverse(page)
  await page.goto(`/app/universes/${universeId}`)
  const marker = await page.evaluate(() => ((window as unknown as { kept: number }).kept = 1))
  await page.getByRole('button', { name: 'Assistant' }).click()
  await page.getByTestId('assistant-input').fill('Who lives here?')
  await page.getByTestId('assistant-ask').click()
  await expect(
    page.getByTestId('assistant-turn').last().getByTestId('assistant-answer'),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTestId('account-menu-trigger').first().click()
  await page.getByTestId('account-menu-profile').click()
  await page.waitForURL('**/app/profile')
  await page.getByTestId('profile-tab-usage').click()
  expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(marker)
  await expectUsage(page, 1, 10, '9 questions left')

  // A blank question never reaches the model, so it is not counted.
  const refused = await page.request.post(`/api/universes/${universeId}/assistant`, {
    data: { question: '   ', history: [] },
  })
  expect(refused.status()).toBe(400)
  await page.reload()
  await expectUsage(page, 1, 10, '9 questions left')
})

test('a used-up allowance says when the next question can be asked', async ({ page }) => {
  await signUp(page)
  const resetsAt = new Date(Date.now() + 4 * 60_000)
  await stubUsage(page, usageBody(10, resetsAt))
  await page.goto('/app/profile?tab=usage')

  const item = assistantUsage(page)
  await expect(item.getByTestId('usage-assistant-amount')).toHaveText('10 of 10 questions used')
  await expect(item.getByTestId('usage-assistant-percent')).toHaveText('100%')
  const at = await page.evaluate(
    (iso) =>
      new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(iso),
      ),
    resetsAt.toISOString(),
  )
  await expect(item.getByTestId('usage-assistant-left')).toHaveText(
    `No questions left. You can ask again at ${at}.`,
  )
  await expect(item.getByRole('meter', { name: 'Questions' })).toHaveAttribute('data-state', 'full')
  await expect(item.getByRole('meter', { name: 'Questions' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  )
})

test('loading is announced, and a failed read offers to try again', async ({ page }) => {
  await signUp(page)

  // Every read fails until Try again; the first ones wait, so the loading state can be seen.
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let failing = true
  await page.route(usagePath, async (route) => {
    if (failing) {
      await held
      await route.fulfill({ status: 500, json: { title: 'Synthetic failure' } })
    } else {
      await route.fulfill({
        json: usageBody(7),
      })
    }
  })
  await page.goto('/app/profile?tab=usage')

  const item = assistantUsage(page)
  await expect(item.getByRole('status')).toHaveText('Checking your usage…')
  await expect(item).toHaveAttribute('aria-busy', 'true')
  release()

  const error = item.getByTestId('usage-assistant-error')
  await expect(error).toHaveRole('alert')
  await expect(error).toContainText("Your usage didn't load.")
  failing = false
  await error.getByRole('button', { name: 'Try again' }).click()

  await expectUsage(page, 7, 70, '3 questions left')
  await expect(item).toHaveAttribute('aria-busy', 'false')
})

test('the Usage section fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await signUp(page)
  await stubUsage(page, usageBody(9))
  await page.goto('/app/profile?tab=usage')

  await expectUsage(page, 9, 90, '1 question left')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  const box = (await page.getByTestId('profile-usage').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
})

test('one Usage section holds Storage, then the AI Assistant', async ({ page }) => {
  await signUp(page)
  await page.goto('/app/profile?tab=usage')

  const section = page.getByTestId('profile-usage')
  await expect(page.getByRole('heading', { level: 2, name: 'Usage' })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 2, name: 'Storage' })).toHaveCount(0)
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Storage', 'AI Assistant'])
  await expect(section.getByRole('meter')).toHaveCount(3)
  await expect(section.getByRole('meter', { name: 'Storage' })).toHaveAttribute(
    'aria-valuetext',
    '0 MB used of 1 GB, 0%',
  )
  await expect(section.getByRole('meter', { name: 'Questions' })).toHaveAttribute(
    'aria-valuetext',
    '0 of 10 questions used, 0%',
  )
  await expect(section.getByRole('meter', { name: 'Change requests' })).toHaveAttribute(
    'aria-valuetext',
    '0 of 5 change requests used, 0%',
  )
})

test('one usage that fails to load leaves the other in place', async ({ page }) => {
  await signUp(page)
  const section = page.getByTestId('profile-usage')

  // Storage fails; the Assistant still shows, and Storage comes back with Try again.
  let storageFails = true
  await page.route(storagePath, (route) =>
    storageFails
      ? route.fulfill({ status: 500, json: { title: 'Synthetic failure' } })
      : route.fallback(),
  )
  await stubUsage(page, usageBody(3))
  await page.goto('/app/profile?tab=usage')

  const storageError = section.getByTestId('usage-storage-error')
  await expect(storageError).toHaveRole('alert')
  await expect(section.getByTestId('usage-assistant-error')).toHaveCount(0)
  await expectUsage(page, 3, 30, '7 questions left')

  storageFails = false
  await storageError.getByRole('button', { name: 'Try again' }).click()
  await expect(section.getByTestId('usage-storage-amount')).toHaveText('0 MB used of 1 GB')

  // The Assistant fails; Storage still shows.
  await page.unroute(usagePath)
  await page.route(usagePath, (route) =>
    route.fulfill({ status: 500, json: { title: 'Synthetic failure' } }),
  )
  await page.reload()
  await expect(section.getByTestId('usage-assistant-error')).toHaveRole('alert')
  await expect(section.getByTestId('usage-storage-error')).toHaveCount(0)
  await expect(section.getByTestId('usage-storage-amount')).toHaveText('0 MB used of 1 GB')
})

test('both allowances used up say so in words', async ({ page }) => {
  await signUp(page)
  await page.route(storagePath, (route) =>
    route.fulfill({
      json: { usedBytes: GiB, quotaBytes: GiB, remainingBytes: 0, loreImagesBytes: GiB },
    }),
  )
  await stubUsage(page, usageBody(10, new Date(Date.now() + 5 * 60_000)))
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
  await expect(section.getByTestId('usage-assistant-left')).toContainText('No questions left.')
  await expect(section.getByRole('meter', { name: 'Questions' })).toHaveAttribute(
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
      await stubUsage(page, usageBody(7))
      await page.goto('/app/profile?tab=usage')

      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expectUsage(page, 7, 70, '3 questions left')
      const section = page.getByTestId('profile-usage')
      await expect(section.getByTestId('usage-storage-amount')).toHaveText('0 MB used of 1 GB')

      // The two items stack in order, inside the page, with nothing pushed sideways.
      const storage = (await section.getByTestId('usage-storage').boundingBox())!
      const assistant = (await section.getByTestId('usage-assistant').boundingBox())!
      expect(assistant.y).toBeGreaterThan(storage.y + storage.height - 1)
      expect(assistant.x).toBe(storage.x)
      expect(storage.x + storage.width).toBeLessThanOrEqual(width)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBe(0)

      // The fill is drawn in a theme colour, not left transparent.
      const fill = await section
        .getByTestId('usage-assistant-meter')
        .locator('.progressbar__fill')
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(fill).not.toBe('rgba(0, 0, 0, 0)')
    })
  }
}
