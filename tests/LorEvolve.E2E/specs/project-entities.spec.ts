import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #144: a project defines its own types and holds its own entries.
 *
 * These are the paths an author actually walks: a game offered its starter types, taking them, making an entry of one
 * with a field value, then adding a type of their own and deleting one they do not want. The isolation that matters
 * most is checked on the screens rather than only in the API tests: a project's types must not appear on the
 * universe's own Types screen, and one project's entries must not appear in another's.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('projent')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

async function universe(page: Page) {
  return api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Gameworld '),
    description: null,
  })
}

/** Kind and lifecycle travel as numbers: 1 is Game and 1 is Active. */
async function game(page: Page, universeId: string) {
  return api<{ id: string; name: string }>(page, 'POST', '/api/projects', {
    name: unique('Hollow Season '),
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

test.describe('Project entities', () => {
  test('a game takes the starter types, holds an entry with a field value, and the author shapes the rest', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await game(page, world.id)

    await page.goto(`/app/projects/${project.id}`)

    // The starter types are offered, not already there: the project begins with none.
    const offer = page.getByTestId('project-schema-offer')
    await expect(offer).toContainText('Map')
    await expect(offer).toContainText('Unit')
    await expect(offer).toContainText('Item')

    await page.getByTestId('project-schema-starters').click()

    const types = page.getByTestId('project-types')
    await expect(types.locator('> li')).toHaveCount(3)
    await expect(types).toContainText('Map')
    await expect(page.getByTestId('project-schema-offer')).toHaveCount(0)

    // Map's starter field records the player counts it supports, as several choices rather than one number.
    await expect(types).toContainText('Supported players')
    await expect(types).toContainText('Several choices')

    // An entry of a type, with one of those choices made. The form opens from the panel's head rather than standing
    // open on the page (#184).
    await page.getByTestId('project-entries-type').selectOption({ label: 'Map' })
    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Saltflats')

    const players = page.locator('[data-testid^="project-entry-value-"]').first()
    await players.getByText('4', { exact: true }).click()

    await page.getByTestId('project-entry-new-save').click()

    await expect(page.getByTestId('project-entry-list')).toContainText('Saltflats')
    await expect(types).toContainText('1 entry')

    // From here the schema is the author's: a type of their own, and one of the starters gone.
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('project-type-new-name').fill('Encounter')
    await page.getByTestId('project-type-new-save').click()
    await expect(types).toContainText('Encounter')

    // Rename and delete live in the row's menu, as they do on a lore type's row.
    // The card's own head, not the whole card: a field row inside it carries a menu of its own.
    const item = types.locator('> li', { hasText: 'Item' }).first().locator('.projectcard__head')
    await item.getByRole('button', { name: /More actions/ }).click()
    await item.getByRole('button', { name: 'Delete type' }).click()
    await expect(types).not.toContainText('Item')

    // A type still used by an entry is not deleted: the refusal is shown rather than the entry losing its type.
    const map = types.locator('> li', { hasText: 'Map' }).first().locator('.projectcard__head')
    await map.getByRole('button', { name: /More actions/ }).click()
    await map.getByRole('button', { name: 'Delete type' }).click()
    await expect(page.getByTestId('project-schema-failed')).toBeVisible()
    await expect(types).toContainText('Map')
  })

  test("a project's types and entries stay out of the universe's lore and out of another project", async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const first = await game(page, world.id)
    const second = await game(page, world.id)

    await page.goto(`/app/projects/${first.id}`)
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('project-type-new-name').fill('Unit')
    await page.getByTestId('project-type-new-save').click()
    await expect(page.getByTestId('project-types')).toContainText('Unit')

    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Saltbearer')
    await page.getByTestId('project-entry-new-save').click()
    await expect(page.getByTestId('project-entry-list')).toContainText('Saltbearer')

    // The other project of the same universe shares neither: it is offered its own starters and holds nothing.
    await page.goto(`/app/projects/${second.id}`)
    await expect(page.getByTestId('project-schema-offer')).toBeVisible()
    await expect(page.getByTestId('project-types').locator('> li')).toHaveCount(0)
    await expect(page.getByTestId('project-entries-needs-type')).toBeVisible()

    // And the universe's own Types screen shows only the lore's types, with none of the game's.
    await page.goto(`/app/universes/${world.id}/types`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main')).not.toContainText('Unit')
  })
})
