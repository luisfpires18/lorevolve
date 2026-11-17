import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #285: search, sort and the nested-type toggle on a game category's entry list. Everything stays inside the
 * open game and category, the filter lives in the address, and Show more continues the filtered list.
 */

const PASSWORD = 'Test-password-123!'
const PAGE_SIZE = 25

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
  test('search narrows one category, keeps to the URL, and Show more continues the filtered list', async ({
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
    await expect(page.getByTestId('project-entry-list')).toBeVisible()

    // The unfiltered first page is as long as the filtered one, so wait for the filtered read itself.
    const searched = page.waitForResponse((response) =>
      /\/entities\?.*q=ember/.test(response.url()),
    )
    await page.getByTestId('project-entries-search').fill('ember')
    await searched
    await expect(page).toHaveURL(/[?&]q=ember/)
    await expect(page).toHaveURL(new RegExp(`type=${alphaUnits.id}`))
    await expect(page.getByText('Frost warden')).toHaveCount(0)
    await expect(page.getByText('Ember of another game')).toHaveCount(0)
    await expect(page.getByTestId('project-entry-list').locator('li')).toHaveCount(PAGE_SIZE)

    // Show more reads the next filtered rows, not the unfiltered list.
    await page.getByRole('button', { name: 'Show more' }).click()
    await expect(page.getByTestId('project-entry-list').locator('li')).toHaveCount(PAGE_SIZE + 3)
    await expect(page.getByText('Frost warden')).toHaveCount(0)

    // The filter survives a reload.
    await page.reload()
    await expect(page.getByTestId('project-entries-search')).toHaveValue('ember')
    await expect(page.getByTestId('project-entry-list').locator('li')).toHaveCount(PAGE_SIZE)

    // Sort by name keeps the first row stable and changes with the order asked for.
    await page.getByTestId('project-entries-sort').selectOption('created')
    await expect(page).toHaveURL(/[?&]sort=created/)
    await expect(page.getByTestId('project-entry-list').locator('li').first()).toContainText(
      'Ember 27',
    )
    await page.getByTestId('project-entries-sort').selectOption({ label: 'Name' })
    await expect(page.getByTestId('project-entry-list').locator('li').first()).toContainText(
      'Ember 00',
    )

    // A card still opens its actions menu.
    await page
      .getByTestId('project-entry-list')
      .locator('li')
      .first()
      .getByRole('button', { name: /more/i })
      .click()
    // ActionMenu has no menu role on purpose; its items are plain buttons.
    await expect(page.locator('[data-testid^="project-entry-delete-"]:visible')).toHaveCount(1)
    await page.keyboard.press('Escape')

    // Nothing matches: a clear empty state, and Clear filters restores the list.
    await page.getByTestId('project-entries-search').fill('zzzz')
    await expect(page.getByTestId('project-entries-no-match')).toBeVisible()
    await page.getByTestId('project-entries-clear').click()
    await expect(page.getByTestId('project-entries-search')).toHaveValue('')
    await expect(page.getByTestId('project-entries-no-match')).toHaveCount(0)
    // By name, Frost warden sorts after the first page of Embers, so the unfiltered first page is full again.
    await expect(page.getByTestId('project-entry-list').locator('li')).toHaveCount(PAGE_SIZE)
    await expect(page.getByTestId('project-entries-more')).toBeVisible()
  })

  test("the nested toggle includes a child type's entries", async ({ page }) => {
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

    await page.goto(`/app/universes/${world.id}/game-entities/${game.id}?type=${parent.id}`)
    await expect(page.getByText('Parent entry')).toBeVisible()
    await expect(page.getByText('Child entry')).toHaveCount(0)

    // A click, not check(): the box follows the address, which a router transition updates a moment later.
    await page.getByTestId('project-entries-nested').click()
    await expect(page.getByTestId('project-entries-nested')).toBeChecked()
    await expect(page).toHaveURL(/[?&]nested=1/)
    await expect(page.getByText('Child entry')).toBeVisible()
    await expect(page.getByText('Parent entry')).toBeVisible()
  })
})
