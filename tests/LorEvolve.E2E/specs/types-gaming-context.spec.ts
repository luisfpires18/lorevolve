import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #280: the Types screen offers Gaming beside Lore. A game's types are its own, so picking a game shows only that
 * game's types, the choice lives in the address, and switching or picking changes nothing in the data.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('typesctx')
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

/** Kind and lifecycle travel as numbers: 1 is Game and 1 is Active. */
async function game(page: Page, universeId: string, name: string, typeName: string) {
  const project = await api<{ id: string }>(page, 'POST', '/api/projects', {
    name,
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
  await api(page, 'POST', `/api/projects/${project.id}/entity-types`, {
    name: typeName,
    description: null,
    icon: null,
    accentColor: null,
    parentId: null,
  })
  return project
}

async function snapshot(page: Page, universeId: string, projectIds: string[]) {
  return JSON.stringify([
    await api(page, 'GET', `/api/universes/${universeId}/entity-types`),
    ...(await Promise.all(
      projectIds.map((id) => api(page, 'GET', `/api/projects/${id}/entity-types`)),
    )),
  ])
}

test.describe('Types: Lore and Gaming', () => {
  test('a game is picked in the address, shows only its own types, and nothing is written', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Contextworld '),
      description: null,
    })
    const types = `/app/universes/${world.id}/types`

    // No game: the tabs as before, and no Gaming option (the switch always offers Templates).
    await page.goto(types)
    await expect(page.getByTestId('types-tab-lore')).toBeVisible()
    await expect(page.getByTestId('types-context-gaming')).toHaveCount(0)

    const nameA = unique('Alpha ')
    const nameB = unique('Beta ')
    const typeA = unique('Aunit')
    const typeB = unique('Bunit')
    const a = await game(page, world.id, nameA, typeA)
    const b = await game(page, world.id, nameB, typeB)
    const before = await snapshot(page, world.id, [a.id, b.id])

    // Gaming lands on the first listed game and shows its types only.
    await page.goto(types)
    await page.getByTestId('types-context-gaming').click()
    await expect(page.getByTestId('types-game')).toBeVisible()
    // One title: the page's own. The game's types panel adds buttons, not a second head (#412).
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Entity types' })).toHaveCount(0)
    const first = (await page.getByTestId('types-game').inputValue()) === a.id ? a : b
    const second = first === a ? b : a
    const [firstType, secondType] = first === a ? [typeA, typeB] : [typeB, typeA]
    await expect(page.getByText(firstType)).toBeVisible()
    await expect(page.getByText(secondType)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`context=gaming&game=${first.id}`))

    // Pick the other game: only its types, and the address says so.
    await page.getByTestId('types-game').selectOption(second.id)
    await expect(page.getByText(secondType)).toBeVisible()
    await expect(page.getByText(firstType)).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`context=gaming&game=${second.id}`))

    // A reload keeps the game.
    await page.reload()
    await expect(page.getByText(secondType)).toBeVisible()
    await expect(page.getByTestId('types-game')).toHaveValue(second.id)

    // An unknown game falls back to a listed one.
    await page.goto(`${types}?context=gaming&game=00000000-0000-0000-0000-000000000000`)
    await expect(page.getByTestId('types-game')).not.toHaveValue('')
    await expect(page.getByTestId('types-game').locator('option')).toHaveCount(2)

    // Back to Lore drops context and game; the tabs return and ?tab= still works.
    await page.getByTestId('types-context-lore').click()
    await expect(page).not.toHaveURL(/context=/)
    await page.goto(`${types}?tab=relations`)
    await expect(page.getByTestId('types-panel-relations')).toBeVisible()

    expect(await snapshot(page, world.id, [a.id, b.id])).toBe(before)
  })
})
