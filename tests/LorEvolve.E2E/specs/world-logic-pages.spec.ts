import { expect, test, type Page } from '@playwright/test'

/**
 * World Logic's pages past the end, end to end (#456): a list that is not empty, read on a page it does not have, says
 * so and offers the first page, rather than reading like an empty list. A list that is empty says what it is for; that
 * is in world-logic.spec.ts ("an empty universe says what a rule and a System are").
 *
 * Each test registers its own account and builds what it needs through the API.
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors WORLD_LOGIC_PAGE_SIZE in src/LorEvolve.Web/src/worldLogic/api.ts. */
const WORLD_LOGIC_PAGE_SIZE = 50

/** Seeds `count` things a few at a time, because one at a time is slow and all at once floods the API. */
async function inBatches(count: number, size: number, make: (at: number) => Promise<unknown>) {
  for (let from = 0; from < count; from += size) {
    const batch = []
    for (let at = from; at < Math.min(from + size, count); at += 1) batch.push(make(at))
    await Promise.all(batch)
  }
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('logician')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: 'GET' | 'POST', url: string, data?: unknown) {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function seedUniverse(page: Page) {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Logical '),
    description: null,
    accentColor: '#4f6bd6',
  })
  return universe.id
}

test.describe('World Logic', () => {
  test('a page past the end says so and goes back to the first', async ({ page }) => {
    test.slow()
    await signUp(page)
    const universeId = await seedUniverse(page)

    // Two pages of each kind, so page 99 is past the end of a list that is not empty.
    const overAPage = WORLD_LOGIC_PAGE_SIZE + 1
    await inBatches(overAPage, 10, (at) =>
      api(page, 'POST', `/api/universes/${universeId}/system-rules`, {
        title: `Rule ${at + 1}`,
        description: 'Seeded for paging.',
      }),
    )
    await inBatches(overAPage, 10, (at) =>
      api(page, 'POST', `/api/universes/${universeId}/systems`, {
        name: `System ${at + 1}`,
        summary: 'Seeded for paging.',
      }),
    )

    const base = `/app/universes/${universeId}/world-logic`
    await page.goto(`${base}?rulesPage=99`)

    const rulesPageEmpty = page.getByTestId('world-logic-rules-page-empty')
    await expect(rulesPageEmpty).toBeVisible()
    await expect(page.getByTestId('world-logic-rule-list')).toBeHidden()
    await expect(page.getByTestId('world-logic-rules-empty')).toBeHidden()
    await rulesPageEmpty.getByRole('button').click()
    await expect(page.getByTestId('world-logic-rule-list')).toBeVisible()
    await expect(page.getByTestId('world-logic-rules-pager')).toContainText('Page 1 of 2')

    // The Systems tab says the same of its own page.
    await page.getByTestId('world-logic-tab-systems').click()
    await expect(page.getByTestId('world-logic-system-list')).toBeVisible()
    const address = new URL(page.url())
    address.searchParams.set('systemsPage', '99')
    await page.goto(address.pathname + address.search)

    const systemsPageEmpty = page.getByTestId('world-logic-systems-page-empty')
    await expect(systemsPageEmpty).toBeVisible()
    await expect(page.getByTestId('world-logic-system-list')).toBeHidden()
    await expect(page.getByTestId('world-logic-systems-empty')).toBeHidden()
    await systemsPageEmpty.getByRole('button').click()
    await expect(page.getByTestId('world-logic-system-list')).toBeVisible()
    await expect(page.getByTestId('world-logic-systems-pager')).toContainText('Page 1 of 2')
  })
})
