import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * Issue #287: a game entry's page shows its own type's valued fields in order, never a field of another game's same-named
 * type; Edit opens the entry form, a save shows at once, and a stale save is refused. Since #551 it is the Lore entry page.
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
    // As on a Lore entry, only the fields that hold a value are listed.
    const fields = page.getByTestId('entry-fields')
    await expect(fields.locator('dt')).toHaveText(['Motto', 'Strength', 'Rank'])
    await expect(fields).toContainText('Hold fast')
    await expect(fields).toContainText('7')
    await expect(fields).toContainText('High')
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
    await expect(page.getByTestId('entity-missing')).toBeVisible()

    // Edit: the form holds the stored values; a save shows at once.
    await page.goto(`${base}/${entry.id}`)
    await page.getByTestId('edit-entity').click()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Bram')
    await page.getByLabel('Name', { exact: true }).fill('Bram the Bold')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-name')).toHaveText('Bram the Bold')
    await expect(fields).toContainText('Hold fast')

    // A change made elsewhere after the form opened: the save is refused and the form stays.
    await page.getByTestId('edit-entity').click()
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
    await page.getByLabel('Name', { exact: true }).fill('Too late')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-conflict')).toBeVisible()
    await expect(page.getByTestId('entry-form')).toBeVisible()
  })

  test('a project entry page sends no request that answers 4xx, and draws none of Lore own parts', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Fldworld '),
      description: null,
    })
    const unit = await gameType(page, world.id, 'Unit', [{ name: 'Motto', kind: 0 }])
    const motto = unit.fields[0].id
    const made = (name: string) =>
      api<{ id: string }>(page, 'POST', `/api/projects/${unit.gameId}/entities`, {
        entityTypeId: unit.typeId,
        name,
        summary: null,
        fields: [{ ...blank, fieldDefinitionId: motto, text: 'Hold fast' }],
      })
    const first = await made('Bram')
    const second = await made('Keep')

    // Every API answer from 400 to 499, and every Lore-only call but the pictures' (#551): any call under
    // `/api/universes/{u}/entities/`, and any call under `/api/universes/{u}/` with a segment of a feature a project
    // entry has none of. The segments, from the web's api files: article (lore/article.ts), revisions
    // (lore/revisions.ts), progression and appearances (progression/api.ts), private-note (lore/privateNote.ts),
    // relationships and relationship-types (relationships/api.ts), comments and comment-threads (comments/api.ts),
    // suggestions (suggestions/api.ts), publication, publish and unpublish (publishing/api.ts), family-tree
    // (familyTree/api.ts), maps and map-pins (maps/api.ts).
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
      if (
        (segments[0] === 'entities' && segments.length > 1) ||
        segments.some((segment) => loreOnlySegments.has(segment))
      )
        loreCalls.push(said)
    })

    const shell = `/app/universes/${world.id}/projects/${unit.gameId}/entities`
    const games = `/app/universes/${world.id}/game-entities/${unit.gameId}`
    const loreOnly = [
      'entry-views',
      'comments-trigger',
      'private-note-trigger',
      'entity-family-tree',
      'suggest-entity',
      'entry-canon-status',
      'entry-aliases',
      'entry-tags',
      'article',
      'article-empty',
      'entry-maps',
    ]
    for (const [base, entry, name] of [
      [shell, first.id, 'Bram'],
      [games, second.id, 'Keep'],
    ]) {
      await page.goto(`${base}/${entry}`)
      await expect(page.getByTestId('entry-name')).toHaveText(name)
      for (const id of loreOnly) await expect(page.getByTestId(id)).toHaveCount(0)
      await expect(page.locator('[data-testid^="canon-"]')).toHaveCount(0)
      await expect(page.locator('[data-testid^="entry-publication"]')).toHaveCount(0)
      await page.getByTestId('entity-actions').click()
      await expect(page.getByTestId('trash-entity')).toBeVisible()
      await expect(page.getByTestId('duplicate-entity')).toHaveCount(0)
      await page.keyboard.press('Escape')

      // Edit has no aliases or tags; a name and a field change save in place.
      await page.getByTestId('edit-entity').click()
      await expect(page.getByLabel('Aliases', { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Tags', { exact: true })).toHaveCount(0)
      await page.getByLabel('Name', { exact: true }).fill(`${name} the Bold`)
      await page.getByLabel('Motto').fill('Stand firm')
      await page.getByTestId('save-entity').click()
      await expect(page.getByTestId('entry-name')).toHaveText(`${name} the Bold`)
      await expect(page.getByTestId('entry-fields')).toContainText('Stand firm')

      // Create, in the type the address names. The recorder above is on before this load, so the create page's
      // reads and the create request are covered; nothing Lore-only is drawn, the article note included.
      await page.goto(`${base}/new?type=${unit.typeId}`)
      await expect(page.getByLabel('Motto')).toBeVisible()
      for (const id of loreOnly) await expect(page.getByTestId(id)).toHaveCount(0)
      await expect(page.locator('[data-testid^="canon-"]')).toHaveCount(0)
      await expect(page.locator('[data-testid^="entry-publication"]')).toHaveCount(0)
      await expect(page.getByLabel('Aliases', { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Tags', { exact: true })).toHaveCount(0)
      await expect(
        page.getByText('The article is written on the entry once it exists.'),
      ).toHaveCount(0)
      await page.getByLabel('Name', { exact: true }).fill(`New in ${name}`)
      await page.getByTestId('save-entity').click()
      await page.waitForURL(new RegExp(`${base}/[0-9a-f-]{36}$`))
      await expect(page.getByTestId('entry-name')).toHaveText(`New in ${name}`)
      expect(bad4xx, base).toEqual([])
      expect(loreCalls, base).toEqual([])
    }

    // Move to Trash lands on the universe's Trash, as a lore entry's does.
    await page.goto(`${games}/${second.id}`)
    await page.getByTestId('entity-actions').click()
    await page.getByTestId('trash-entity').click()
    await acceptConfirm(page, 'Move this entry to the Trash?')
    await expect(page).toHaveURL(`/app/universes/${world.id}/trash`)

    expect(bad4xx).toEqual([])
    expect(loreCalls).toEqual([])
  })
})
