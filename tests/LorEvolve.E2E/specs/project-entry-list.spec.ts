import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #551 step C3: a project entry list asks only for what a project has. It sends no request that answers 4xx,
 * makes no Lore-only call, and draws none of Lore's list parts, on both address families.
 */

const PASSWORD = 'Test-password-123!'

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

test.describe('Project entry list', () => {
  test("a project entry list sends no request that answers 4xx, and draws none of Lore's list parts", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Listworld '),
      description: null,
    })
    const game = await newGame(page, world.id, 'List game')
    const unit = await newType(page, game.id, 'Unit')
    await api(page, 'POST', `/api/projects/${game.id}/entity-types/${unit.id}/fields`, {
      name: 'Motto',
      kind: 0,
      isRequired: false,
      options: null,
      imageShape: null,
    })
    // A Lore type in a group: Lore would draw its group controls for it, as it draws its field filter for Motto.
    await api(page, 'POST', `/api/universes/${world.id}/entity-types`, {
      name: 'Runes',
      description: null,
      icon: null,
      accentColor: null,
      displayOrder: null,
      groups: [{ name: 'Magic' }],
    })
    const elite = await newType(page, game.id, 'Elite', unit.id)
    const bram = (await newEntry(page, game.id, unit.id, 'Bram')) as { id: string }
    await newEntry(page, game.id, elite.id, 'Keep')

    // Every API answer from 400 to 499, and every Lore-only call but the pictures' (#551): any call under
    // `/api/universes/{u}/entities` (the Lore list read itself included), and any call under `/api/universes/{u}/` with
    // a segment of a feature a project entry has none of. The types and groups the workspace reads on every load are
    // not counted. This recorder is this test's own, on before the first navigation.
    const bad4xx: string[] = []
    const loreCalls: string[] = []
    const universe = `/api/universes/${world.id}/`
    const loreOnlySegments = new Set([
      'article',
      'revisions',
      'progression',
      'appearances',
      'private-note',
      'relationships',
      'relationship-types',
      'comments',
      'comment-threads',
      'suggestions',
      'publication',
      'publish',
      'unpublish',
      'family-tree',
      'maps',
      'map-pins',
    ])
    page.on('response', (response) => {
      const { pathname } = new URL(response.url())
      const said = `${response.status()} ${response.request().method()} ${pathname}`
      if (pathname.startsWith('/api/') && response.status() >= 400 && response.status() < 500)
        bad4xx.push(said)
      if (!pathname.startsWith(universe) || /\/(image|field-images)(\/|$)/.test(pathname)) return
      const segments = pathname.slice(universe.length).split('/')
      if (segments[0] === 'entities' || segments.some((segment) => loreOnlySegments.has(segment)))
        loreCalls.push(said)
    })

    const shell = `/app/universes/${world.id}/projects/${game.id}/entities`
    const games = `/app/universes/${world.id}/game-entities/${game.id}`
    const loreParts = [
      'mass-create',
      'lore-exact',
      'lore-field-filters',
      'lore-add-field-filter',
      'lore-select',
      'lore-selectbar',
      'lore-trashed',
      'lore-groups',
    ]
    for (const base of [shell, games]) {
      // The catalog: a card counts its type with its sub-types, and New is the create page.
      await page.goto(base)
      const unitCard = page
        .getByTestId('lore-type-cards')
        .getByTestId('lore-type-card')
        .filter({ hasText: 'Unit' })
        .first()
      await expect(unitCard).toContainText('2 entries')
      await expect(page.getByTestId('new-entity')).toHaveAttribute('href', `${base}/new`)
      await expect(page.getByTestId('mass-create')).toHaveCount(0)
      await expect(page.getByTestId('lore-browse-groups')).toHaveCount(0)

      // The type's list: one page of the project's entries, with none of Lore's list parts.
      const read = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          url.pathname === `/api/projects/${game.id}/entities` &&
          `${url.searchParams.get('skip')}/${url.searchParams.get('take')}` === '0/12' &&
          url.searchParams.get('includeDescendants') === 'true' &&
          url.searchParams.get('sort') === 'updated'
        )
      })
      await page.goto(`${base}?type=${unit.id}`)
      await read
      const grid = page.getByTestId('entity-grid')
      await expect(grid.locator('[data-entity-name="Bram"]')).toBeVisible()
      await expect(grid.locator('[data-entity-name="Keep"]')).toBeVisible()
      for (const id of loreParts) await expect(page.getByTestId(id), id).toHaveCount(0)
      await expect(page.locator('.entitycard__status')).toHaveCount(0)
      await expect(page.getByText('Any status')).toHaveCount(0)

      // Search by name, and sort.
      await page.getByTestId('lore-search').fill('bra')
      await expect(page).toHaveURL(/[?&]q=bra/)
      await expect(grid.locator('> li')).toHaveCount(1)
      await expect(grid).toContainText('Bram')
      await page.getByTestId('lore-sort').selectOption({ label: 'Name' })
      await expect(page).toHaveURL(/[?&]sort=name/)

      // Old addresses: the highlight and the nested toggle are ignored, and Add lands on the create page.
      await page.goto(`${base}?type=${unit.id}&entry=${bram.id}&nested=1`)
      await expect(grid.locator('> li')).toHaveCount(2)
      await page.goto(`${base}?type=${unit.id}&add=1`)
      await expect(page).toHaveURL(`${base}/new?type=${unit.id}`)

      expect(bad4xx, base).toEqual([])
      expect(loreCalls, base).toEqual([])
    }
  })
})
