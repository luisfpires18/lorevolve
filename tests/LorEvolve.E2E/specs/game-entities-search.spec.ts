import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #285: search and sort on a game category's entry list, which is the Lore list since #551. Everything stays
 * inside the open game and category, the filter lives in the address, and the pager continues the filtered list.
 */

const PASSWORD = 'Test-password-123!'
/** Lore's default page. */
const PAGE_SIZE = 12

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('gamesearch')
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

/** Kind 1 is Game and lifecycle 1 is Active. */
async function newGame(page: Page, universeId: string, name: string) {
  return api<{ id: string }>(page, 'POST', '/api/projects', {
    name,
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

async function newType(
  page: Page,
  projectId: string,
  name: string,
  parentId: string | null = null,
) {
  return api<{ id: string }>(page, 'POST', `/api/projects/${projectId}/entity-types`, {
    name,
    description: null,
    icon: null,
    accentColor: null,
    parentId,
  })
}

async function newEntry(page: Page, projectId: string, entityTypeId: string, name: string) {
  return api(page, 'POST', `/api/projects/${projectId}/entities`, {
    entityTypeId,
    name,
    summary: null,
  })
}

test.describe('Game Entities search', () => {
  test('search narrows one category, keeps to the URL, and the pager continues the filtered list', async ({
    page,
  }) => {
    // Over a page of entries are created one request at a time, which alone takes most of the default 30 seconds.
    test.slow()
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Searchworld '),
      description: null,
    })
    const alpha = await newGame(page, world.id, 'Alpha game')
    const beta = await newGame(page, world.id, 'Beta game')
    const alphaUnits = await newType(page, alpha.id, 'Units')
    const betaUnits = await newType(page, beta.id, 'Units')

    // More than one page of matches, plus names that do not match.
    for (let index = 0; index < PAGE_SIZE + 3; index += 1) {
      await newEntry(page, alpha.id, alphaUnits.id, `Ember ${String(index).padStart(2, '0')}`)
    }
    await newEntry(page, alpha.id, alphaUnits.id, 'Frost warden')
    await newEntry(page, beta.id, betaUnits.id, 'Ember of another game')

    await page.goto(`/app/universes/${world.id}/game-entities/${alpha.id}?type=${alphaUnits.id}`)
    const grid = page.getByTestId('entity-grid')
    await expect(grid).toBeVisible()

    // The unfiltered first page is as long as the filtered one, so wait for the filtered read itself.
    const searched = page.waitForResponse((response) =>
      /\/entities\?.*q=ember/.test(response.url()),
    )
    await page.getByTestId('lore-search').fill('ember')
    await searched
    await expect(page).toHaveURL(/[?&]q=ember/)
    await expect(page).toHaveURL(new RegExp(`type=${alphaUnits.id}`))
    await expect(page.getByText('Frost warden')).toHaveCount(0)
    await expect(page.getByText('Ember of another game')).toHaveCount(0)
    await expect(grid.locator('> li')).toHaveCount(PAGE_SIZE)

    // Next reads the next filtered page, not the unfiltered list.
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/[?&]page=2/)
    await expect(grid.locator('> li')).toHaveCount(3)
    await expect(page.getByText('Frost warden')).toHaveCount(0)

    // The filter and the page survive a reload.
    await page.reload()
    await expect(page.getByTestId('lore-search')).toHaveValue('ember')
    await expect(page).toHaveURL(/[?&]page=2/)
    await expect(grid.locator('> li')).toHaveCount(3)

    // The order asked for: the newest first, then by name.
    await page.getByTestId('lore-sort').selectOption('created')
    await expect(page).toHaveURL(/[?&]sort=created/)
    await expect(grid.locator('> li').first()).toContainText('Ember 14')
    await page.getByTestId('lore-sort').selectOption({ label: 'Name' })
    await expect(page).toHaveURL(/[?&]sort=name/)
    await expect(grid.locator('> li').first()).toContainText('Ember 00')

    // A card is a link with no actions menu: there is no Delete on the list (#551 pick 2).
    await expect(grid.locator('> li').first().getByRole('button', { name: /more/i })).toHaveCount(0)
    await expect(page.locator('[data-testid^="project-entry-delete-"]')).toHaveCount(0)

    // Nothing matches: a clear empty state, and Clear filters restores the list.
    await page.getByTestId('lore-search').fill('zzzz')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    await page.getByTestId('lore-clear-filters').click()
    await expect(page.getByTestId('lore-search')).toHaveValue('')
    await expect(page.getByTestId('entity-empty')).toHaveCount(0)
    await expect(grid.locator('> li')).toHaveCount(PAGE_SIZE)
  })

  test("a type lists its nested types' entries too", async ({ page }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Nestworld '),
      description: null,
    })
    const game = await newGame(page, world.id, 'Nest game')
    const parent = await newType(page, game.id, 'Creatures')
    const child = await newType(page, game.id, 'Beasts', parent.id)
    await newEntry(page, game.id, parent.id, 'Parent entry')
    await newEntry(page, game.id, child.id, 'Child entry')

    const list = `/app/universes/${world.id}/game-entities/${game.id}?type=${parent.id}`
    await page.goto(list)
    await expect(page.getByText('Parent entry')).toBeVisible()
    await expect(page.getByText('Child entry')).toBeVisible()
    await expect(page.getByTestId('project-entries-nested')).toHaveCount(0)

    // An old address with the toggle on lists the same two.
    await page.goto(`${list}&nested=1`)
    await expect(page.getByText('Parent entry')).toBeVisible()
    await expect(page.getByText('Child entry')).toBeVisible()
  })
})
