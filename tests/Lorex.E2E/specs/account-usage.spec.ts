import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * The Profile's Usage section (ADR 0045): the account's AI Assistant allowance as the server counts it. What counts, the
 * window, and that one account never sees another's are proved by the API tests; this proves that the server's numbers
 * reach the screen in words and as a meter, that asking updates them without reloading the app, and that the loading,
 * full and failed states read properly on a desktop and a phone. Stubbed responses are fictional numbers.
 */

const usagePath = '**/api/profile/assistant-usage'

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
    `${used} of 20 questions used`,
  )
  await expect(item.getByTestId('usage-assistant-percent')).toHaveText(`${percent}%`)
  await expect(item.getByTestId('usage-assistant-left')).toHaveText(left)
  const meter = item.getByRole('meter', { name: 'AI Assistant' })
  await expect(meter).toHaveAttribute('aria-valuenow', `${percent}`)
  await expect(meter).toHaveAttribute('aria-valuetext', `${used} of 20 questions used, ${percent}%`)
}

function stubUsage(page: Page, body: object) {
  return page.route(usagePath, (route) => route.fulfill({ json: body }))
}

test('a new account has its whole allowance, and asking counts without reloading the app', async ({
  page,
}) => {
  await signUp(page)
  await page.goto('/app/profile')

  const section = page.getByTestId('profile-usage')
  await expect(section.getByRole('heading', { level: 2, name: 'Usage' })).toBeVisible()
  await expect(section.getByRole('heading', { level: 3, name: 'AI Assistant' })).toBeVisible()
  await expectUsage(page, 0, 0, '20 questions left')
  await expect(section).toContainText('A question counts even when the answer fails.')
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
  expect(await page.evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(marker)
  await expectUsage(page, 1, 5, '19 questions left')

  // A question the assistant refuses still counts, as the server counts it.
  const refused = await page.request.post(`/api/universes/${universeId}/assistant`, {
    data: { question: '   ', history: [] },
  })
  expect(refused.status()).toBe(400)
  await page.reload()
  await expectUsage(page, 2, 10, '18 questions left')
})

test('a used-up allowance says when the next question can be asked', async ({ page }) => {
  await signUp(page)
  const resetsAt = new Date(Date.now() + 4 * 60_000)
  await stubUsage(page, { used: 20, limit: 20, remaining: 0, windowSeconds: 600, resetsAt })
  await page.goto('/app/profile')

  const item = assistantUsage(page)
  await expect(item.getByTestId('usage-assistant-amount')).toHaveText('20 of 20 questions used')
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
  await expect(item.getByRole('meter', { name: 'AI Assistant' })).toHaveAttribute(
    'data-state',
    'full',
  )
  await expect(item.getByRole('meter', { name: 'AI Assistant' })).toHaveAttribute(
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
        json: { used: 7, limit: 20, remaining: 13, windowSeconds: 600, resetsAt: null },
      })
    }
  })
  await page.goto('/app/profile')

  const item = assistantUsage(page)
  await expect(item.getByRole('status')).toHaveText('Checking your usage…')
  await expect(page.getByTestId('profile-usage')).toHaveAttribute('aria-busy', 'true')
  release()

  const error = item.getByTestId('usage-assistant-error')
  await expect(error).toHaveRole('alert')
  await expect(error).toContainText("Your usage didn't load.")
  failing = false
  await error.getByRole('button', { name: 'Try again' }).click()

  await expectUsage(page, 7, 35, '13 questions left')
  await expect(page.getByTestId('profile-usage')).toHaveAttribute('aria-busy', 'false')
})

test('the Usage section fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await signUp(page)
  await stubUsage(page, { used: 19, limit: 20, remaining: 1, windowSeconds: 600, resetsAt: null })
  await page.goto('/app/profile')

  await expectUsage(page, 19, 95, '1 question left')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  const box = (await page.getByTestId('profile-usage').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
})
