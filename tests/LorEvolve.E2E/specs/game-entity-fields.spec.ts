import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #287: a game entry's page shows its own type's fields in order, an empty one as "No value yet", never a field of
 * another game's same-named type; Edit opens the entry form, a save shows at once, and a stale save is refused.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('gamefld')
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

type Field = { id: string; name: string; options: { id: string; value: string }[] }

/** A game (kind 1) with one type and the named fields (kinds are numbers on the wire). */
async function gameType(
  page: Page,
  universeId: string,
  typeName: string,
  fields: { name: string; kind: number; options?: string[] }[],
) {
  const game = await api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Game '),
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
  const type = await api<{ id: string }>(page, 'POST', `/api/projects/${game.id}/entity-types`, {
    name: typeName,
    description: null,
    icon: null,
    accentColor: null,
    parentId: null,
  })
  let made: Field[] = []
  for (const field of fields) {
    made = (
      await api<{ fields: Field[] }>(
        page,
        'POST',
        `/api/projects/${game.id}/entity-types/${type.id}/fields`,
        {
          name: field.name,
          kind: field.kind,
          isRequired: false,
          options: field.options ?? null,
          imageShape: null,
        },
      )
    ).fields
  }
  return { gameId: game.id, typeId: type.id, fields: made }
}

const blank = {
  text: null,
  number: null,
  boolean: null,
  date: null,
  optionIds: null,
  referencedEntityId: null,
  eraId: null,
}

test.describe('Game entity fields', () => {
  test('fields read in type order, stay in their game, and Edit saves in place', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Fldworld '),
      description: null,
    })
    // Kinds: 0 short text, 2 number, 4 date, 5 select.
    const unit = await gameType(page, world.id, 'Unit', [
      { name: 'Motto', kind: 0 },
      { name: 'Strength', kind: 2 },
      { name: 'Founded', kind: 4 },
      { name: 'Rank', kind: 5, options: ['Low', 'High'] },
    ])
    const other = await gameType(page, world.id, 'Unit', [{ name: 'Secret', kind: 0 }])
    const id = (name: string) => unit.fields.find((one) => one.name === name)!
    const entry = await api<{ id: string; version: number }>(
      page,
      'POST',
      `/api/projects/${unit.gameId}/entities`,
      {
        entityTypeId: unit.typeId,
        name: 'Bram',
        summary: null,
        fields: [
          { ...blank, fieldDefinitionId: id('Motto').id, text: 'Hold fast' },
          { ...blank, fieldDefinitionId: id('Strength').id, number: 7 },
          { ...blank, fieldDefinitionId: id('Rank').id, optionIds: [id('Rank').options[1].id] },
        ],
      },
    )
    const base = `/app/universes/${world.id}/game-entities/${unit.gameId}`

    await page.goto(`${base}/${entry.id}`)
    const fields = page.getByTestId('game-entity-fields')
    await expect(fields.locator('dt')).toHaveText(['Motto', 'Strength', 'Founded', 'Rank'])
    await expect(page.getByTestId(`game-entity-field-${id('Motto').id}`)).toContainText('Hold fast')
    await expect(page.getByTestId(`game-entity-field-${id('Strength').id}`)).toContainText('7')
    await expect(page.getByTestId(`game-entity-field-${id('Rank').id}`)).toContainText('High')
    await expect(page.getByTestId(`game-entity-field-${id('Founded').id}`)).toContainText(
      'No value yet',
    )
    await expect(fields).not.toContainText('Secret')

    // Another game's entry under this game's address is not found.
    const foreign = await api<{ id: string }>(
      page,
      'POST',
      `/api/projects/${other.gameId}/entities`,
      {
        entityTypeId: other.typeId,
        name: 'Elsewhere',
        summary: null,
      },
    )
    await page.goto(`${base}/${foreign.id}`)
    await expect(page.getByTestId('game-entity-missing')).toBeVisible()

    // Edit: the form holds the stored values; a save shows at once.
    await page.goto(`${base}/${entry.id}`)
    await page.getByTestId('project-entity-edit').click()
    await expect(page.getByTestId('project-entry-edit-name')).toHaveValue('Bram')
    await page.getByTestId('project-entry-edit-name').fill('Bram the Bold')
    await page.getByTestId('project-entry-edit-save').click()
    await expect(page.getByTestId('game-entity-title')).toHaveText('Bram the Bold')
    await expect(page.getByTestId(`game-entity-field-${id('Motto').id}`)).toContainText('Hold fast')

    // A change made elsewhere after the form opened: the save is refused and the form stays.
    await page.getByTestId('project-entity-edit').click()
    const current = await api<{ version: number }>(
      page,
      'GET',
      `/api/projects/${unit.gameId}/entities/${entry.id}`,
    )
    await api(page, 'PUT', `/api/projects/${unit.gameId}/entities/${entry.id}`, {
      entityTypeId: unit.typeId,
      name: 'Changed elsewhere',
      summary: null,
      fields: [],
      expectedVersion: current.version,
    })
    await page.getByTestId('project-entry-edit-name').fill('Too late')
    await page.getByTestId('project-entry-edit-save').click()
    await expect(page.getByTestId('project-entity-edit-failed')).toBeVisible()
    await expect(page.getByTestId('project-entry-edit')).toBeVisible()
  })
})
