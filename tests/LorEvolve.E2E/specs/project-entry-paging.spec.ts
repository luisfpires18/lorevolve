import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #557: a project's entry list pages on the server, as the Lore list does. Each page is its own request, the
 * pager is cut from the server's total, and that total is the type card's count.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('gamepaging')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

async function newType(page: Page, projectId: string, name: string, parentId: string | null) {
  return api<{ id: string }>(page, 'POST', `/api/projects/${projectId}/entity-types`, {
    name,
    description: null,
    icon: null,
    accentColor: null,
    parentId,
  })
}

const cards = (page: Page) => page.getByTestId('entity-grid').locator(':scope > li')
const names = (page: Page) =>
  page
    .getByTestId('entity-grid')
    .locator('[data-entity-name]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-entity-name')))

/** The list read whose parameters are `want`; a null value is a parameter the read must not carry. */
function listRead(page: Page, projectId: string, want: Record<string, string | null>) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'GET' &&
      url.pathname === `/api/projects/${projectId}/entities` &&
      Object.entries(want).every(([key, value]) => url.searchParams.get(key) === value)
    )
  })
}

test.describe('Project entry paging', () => {
  test("a project type with more entries than a page pages on the server, one page per request, with the card's total", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Pagingworld '),
      description: null,
    })
    // Kind 1 is Game and lifecycle 1 is Active.
    const game = await api<{ id: string }>(page, 'POST', '/api/projects', {
      name: 'Paging game',
      kind: 1,
      lifecycle: 1,
      subtype: null,
      summary: '',
      universeId: world.id,
      expectedVersion: null,
    })
    const unit = await newType(page, game.id, 'Unit', null)
    const elite = await newType(page, game.id, 'Elite', unit.id)
    const all = Array.from(
      { length: 15 },
      (_, index) => `Entry ${String(index + 1).padStart(2, '0')}`,
    )
    for (const [index, name] of all.entries()) {
      await api(page, 'POST', `/api/projects/${game.id}/entities`, {
        entityTypeId: index < 13 ? unit.id : elite.id,
        name,
        summary: null,
      })
    }

    // Every API answer from 400 to 499, and any list read of the old 500 rows.
    const bad: string[] = []
    page.on('response', (response) => {
      const url = new URL(response.url())
      const said = `${response.status()} ${response.request().method()} ${url.pathname}${url.search}`
      if (url.pathname.startsWith('/api/') && response.status() >= 400 && response.status() < 500)
        bad.push(said)
      if (url.searchParams.get('take') === '500') bad.push(said)
    })

    const games = `/app/universes/${world.id}/game-entities/${game.id}`
    const position = page.locator('.pager__position')
    await page.goto(games)
    const unitCard = page
      .getByTestId('lore-type-cards')
      .getByTestId('lore-type-card')
      .filter({ hasText: 'Unit' })
      .first()
    await expect(unitCard).toContainText('15 entries')

    // The first page is one read of 12, with the total of the type and its sub-type.
    const first = listRead(page, game.id, {
      skip: '0',
      take: '12',
      includeDescendants: 'true',
      sort: 'updated',
    })
    await page.goto(`${games}?type=${unit.id}`)
    const body = (await (await first).json()) as { items: unknown[]; totalCount: number }
    expect([body.items.length, body.totalCount]).toEqual([12, 15])
    await expect(position).toHaveText('Page 1 of 2')
    await expect(cards(page)).toHaveCount(12)
    const pageOne = await names(page)

    const second = listRead(page, game.id, { skip: '12', take: '12' })
    await page.getByRole('button', { name: 'Next' }).click()
    await second
    await expect(position).toHaveText('Page 2 of 2')
    await expect(cards(page)).toHaveCount(3)
    expect([...pageOne, ...(await names(page))].sort()).toEqual(all)

    const back = listRead(page, game.id, { skip: '0', take: '12' })
    await page.getByRole('button', { name: 'Previous' }).click()
    await back
    await expect(position).toHaveText('Page 1 of 2')

    // Sorted by name, the server's order runs across the page boundary.
    const byName = listRead(page, game.id, { skip: '0', take: '12', sort: 'name' })
    await page.getByTestId('lore-sort').selectOption({ label: 'Name' })
    await byName
    await expect.poll(() => names(page)).toEqual(all.slice(0, 12))
    const byNameNext = listRead(page, game.id, { skip: '12', take: '12', sort: 'name' })
    await page.getByRole('button', { name: 'Next' }).click()
    await byNameNext
    await expect.poll(() => names(page)).toEqual(all.slice(12))

    // A search is counted on the server: Entry 10 to Entry 15, one page, no pager.
    const searched = listRead(page, game.id, { skip: '0', q: 'Entry 1' })
    await page.getByTestId('lore-search').fill('Entry 1')
    await searched
    await expect(cards(page)).toHaveCount(6)
    await expect(page.locator('.pager')).toHaveCount(0)

    // A larger page holds all 15.
    await page.getByTestId('lore-search').fill('')
    await expect(cards(page)).toHaveCount(12)
    const sixteen = listRead(page, game.id, { skip: '0', take: '16', q: null })
    await page.getByLabel('Items per page').selectOption('16')
    await sixteen
    await expect(cards(page)).toHaveCount(15)
    await expect(page.locator('.pager')).toHaveCount(0)

    // An address past the end lands on the last page, as on the Lore list.
    await page.getByLabel('Items per page').selectOption('12')
    await expect(cards(page)).toHaveCount(12)
    const past = listRead(page, game.id, { skip: '96', take: '12' })
    await page.goto(`${games}?type=${unit.id}&page=9`)
    await past
    await expect(page).toHaveURL(/[?&]page=2$/)
    await expect(position).toHaveText('Page 2 of 2')
    await expect(cards(page)).toHaveCount(3)

    expect(bad).toEqual([])
  })
})
