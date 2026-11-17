import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #284: Game Entities opens a game picker, and a game opens its own category directory. Categories are the
 * game's own types, counts match the entries the category lists, and another game's data never shows.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('gamedir')
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

/** Kind and lifecycle travel as numbers: 1 is Game and 1 is Active; 2 is a Film. */
async function project(page: Page, universeId: string, name: string, kind: number) {
  return api<{ id: string }>(page, 'POST', '/api/projects', {
    name,
    kind,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

/** A game with one custom type holding `entries` records, or no type at all when `typeName` is null. */
async function game(
  page: Page,
  universeId: string,
  name: string,
  typeName: string | null,
  entries = 0,
) {
  const created = await project(page, universeId, name, 1)
  if (!typeName) return created
  const type = await api<{ id: string }>(page, 'POST', `/api/projects/${created.id}/entity-types`, {
    name: typeName,
    description: null,
    icon: null,
    accentColor: null,
    parentId: null,
  })
  for (let index = 0; index < entries; index += 1) {
    await api(page, 'POST', `/api/projects/${created.id}/entities`, {
      entityTypeId: type.id,
      name: `${typeName} entry ${index + 1}`,
      summary: null,
    })
  }
  return created
}

test.describe('Game Entities directory', () => {
  test("lists this universe's games, opens one game's own categories, and counts match", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Dirworld '),
      description: null,
    })
    const other = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Otherworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', 'Relics', 2)
    const beta = await game(page, world.id, 'Beta game', 'Beasts', 1)
    await game(page, world.id, 'Empty game', null)
    await project(page, world.id, 'A film', 2)
    await game(page, other.id, 'Foreign game', 'Foreign things', 1)

    await page.goto(`/app/universes/${world.id}/game-entities`)
    const rows = page.getByTestId('projects-item')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId(`projects-row-${alpha.id}`)).toBeVisible()
    await expect(page.getByText('A film')).toHaveCount(0)
    await expect(page.getByText('Foreign game')).toHaveCount(0)

    await page.getByTestId(`projects-row-${alpha.id}`).click()
    await expect(page).toHaveURL(`/app/universes/${world.id}/game-entities/${alpha.id}`)
    const card = page.getByTestId('lore-type-card').filter({ hasText: 'Relics' })
    await expect(card).toBeVisible()
    await expect(card.getByTestId('lore-type-card-count')).toContainText('2')
    // Beta's category and entries are not part of Alpha's directory.
    await expect(page.getByText('Beasts')).toHaveCount(0)

    await card.getByRole('link').first().click()
    await expect(page).toHaveURL(/[?&]type=/)
    await expect(page.getByText('Relics entry 1')).toBeVisible()
    await expect(page.getByText('Relics entry 2')).toBeVisible()
    await expect(page.getByText('Beasts entry 1')).toHaveCount(0)

    await page.goto(`/app/universes/${world.id}/game-entities/${beta.id}`)
    await expect(page.getByTestId('lore-type-card').filter({ hasText: 'Beasts' })).toBeVisible()
    await expect(page.getByText('Relics')).toHaveCount(0)
  })

  test('a game without types shows the starter panel, and a foreign or non-game id shows not found', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Emptyworld '),
      description: null,
    })
    const other = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Elsewhere '),
      description: null,
    })
    const empty = await game(page, world.id, 'Empty game', null)
    await game(page, world.id, 'Second game', 'Things')
    const film = await project(page, world.id, 'A film', 2)
    const foreign = await game(page, other.id, 'Foreign game', 'Foreign things')

    await page.goto(`/app/universes/${world.id}/game-entities/${empty.id}`)
    await expect(page.getByTestId('game-entities-title')).toHaveText('Empty game')
    await expect(page.getByTestId('lore-type-card')).toHaveCount(0)

    for (const id of [film.id, foreign.id]) {
      await page.goto(`/app/universes/${world.id}/game-entities/${id}`)
      await expect(page.getByTestId('game-entities-missing')).toBeVisible()
    }
    await page.getByTestId('game-entities-back').click()
    await expect(page).toHaveURL(`/app/universes/${world.id}/game-entities`)
  })

  test('a universe with one game skips the picker', async ({ page }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Soloworld '),
      description: null,
    })
    const solo = await game(page, world.id, 'Solo game', 'Relics')
    await page.goto(`/app/universes/${world.id}/game-entities`)
    await expect(page).toHaveURL(`/app/universes/${world.id}/game-entities/${solo.id}`)
    await expect(page.getByTestId('lore-type-card').filter({ hasText: 'Relics' })).toBeVisible()
  })
})
