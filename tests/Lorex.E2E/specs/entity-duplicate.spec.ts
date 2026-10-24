import { expect, test, type Page } from '@playwright/test'

/**
 * Duplicate (Issue #27), end to end: a new entry made from an existing one. The entry's ⋯ menu opens the new-entry form
 * filled from it, the copy panel says what came across and offers the rest, and nothing exists until Create entry - which
 * is the ordinary create, so the copy has its own id and history and the source is left exactly as it was.
 *
 * Each test registers its own account and builds its own universe.
 */
const PASSWORD = 'Test-password-123!'

const FieldKind = { ShortText: 0, EntityReference: 7 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('copier')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), path).toBe(true)
  return response.json()
}

interface Type {
  id: string
  name: string
  fields: { id: string; name: string }[]
}

async function addField(
  page: Page,
  u: string,
  typeId: string,
  name: string,
  kind: number,
  isRequired = false,
) {
  const type = (await post(page, `${u}/entity-types/${typeId}/fields`, {
    name,
    kind,
    isRequired,
    displayOrder: null,
    defaultValue: null,
    options: null,
    semantic: null,
    targetEntityTypeId: null,
    targetGroupId: null,
  })) as Type
  return type.fields.find((field) => field.name === name)!.id
}

interface Entry {
  id: string
  name: string
  summary: string | null
  canonStatus: number
  entityTypeId: string
  aliases: string[]
  tags: string[]
  fields: { fieldDefinitionId: string; text: string | null; referencedEntityId: string | null }[]
}

async function readEntry(page: Page, u: string, id: string) {
  const response = await page.request.get(`${u}/entities/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Entry
}

/**
 * A universe with one Character worth copying: a summary, a tag, an alias, a Title, a Home link to a Location, Canon
 * status and an article holding one outside link and one link inside Lorex. Location has a required Region.
 */
async function world(page: Page) {
  const universeId = (
    (await post(page, '/api/universes', {
      name: unique('Copy World '),
      description: null,
      accentColor: null,
    })) as { id: string }
  ).id
  const u = `/api/universes/${universeId}`
  const types = (await (await page.request.get(`${u}/entity-types`)).json()) as Type[]
  const character = types.find((type) => type.name === 'Character')!.id
  const location = types.find((type) => type.name === 'Location')!.id

  const title = await addField(page, u, character, 'Title', FieldKind.ShortText)
  const home = await addField(page, u, character, 'Home', FieldKind.EntityReference)
  const region = await addField(page, u, location, 'Region', FieldKind.ShortText, true)

  const rivendell = (await post(page, `${u}/entities`, {
    entityTypeId: location,
    name: 'Rivendell',
    summary: null,
    canonStatus: 0,
    aliases: [],
    tags: [],
    fields: [{ fieldDefinitionId: region, text: 'Eriador' }],
  })) as Entry

  const source = (await post(page, `${u}/entities`, {
    entityTypeId: character,
    name: 'Akron Wright',
    summary: 'Heir to the northern seat.',
    canonStatus: 2,
    aliases: ['The Heir'],
    tags: ['nobility'],
    fields: [
      { fieldDefinitionId: title, text: 'Prince' },
      { fieldDefinitionId: home, referencedEntityId: rivendell.id },
    ],
  })) as Entry

  const article = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Raised in ' },
          {
            type: 'text',
            text: 'Rivendell',
            marks: [
              {
                type: 'link',
                attrs: { href: `/app/universes/${universeId}/lore/${rivendell.id}` },
              },
            ],
          },
          { type: 'text', text: '; see ' },
          {
            type: 'text',
            text: 'the map',
            marks: [{ type: 'link', attrs: { href: 'https://example.test/map' } }],
          },
          { type: 'text', text: '.' },
        ],
      },
    ],
  })
  const saved = await page.request.put(`${u}/entities/${source.id}/article`, {
    data: { content: article, expectedVersion: 0 },
  })
  expect(saved.ok()).toBe(true)

  return { universeId, u, character, location, title, home, region, rivendell, source, article }
}

/** Opens the source entry and chooses Duplicate from its ⋯ menu. */
async function duplicate(page: Page, universeId: string, sourceId: string) {
  await page.goto(`/app/universes/${universeId}/lore/${sourceId}`)
  await page.getByTestId('entity-actions').click()
  await page.getByTestId('duplicate-entity').click()
  await page.waitForURL(`/app/universes/${universeId}/lore/new?from=${sourceId}`)
  await expect(page.getByTestId('entry-copy')).toBeVisible()
}

/** Creates the entry the form holds and hands back its id from the address it lands on. */
async function create(page: Page, universeId: string) {
  await page.getByTestId('save-entity').click()
  await page.waitForURL(new RegExp(`/app/universes/${universeId}/lore/[0-9a-f-]{36}$`))
  return page.url().split('/').pop()!
}

test.beforeEach(async ({ page }) => {
  await signUp(page)
})

test('a copy takes the structure, leaves out aliases, links and the article until asked, and is an entry of its own', async ({
  page,
}) => {
  const w = await world(page)
  await duplicate(page, w.universeId, w.source.id)

  const panel = page.getByTestId('entry-copy')
  await expect(panel).toContainText('Copying from Akron Wright')
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Akron Wright (copy)',
  )
  await expect(page.getByRole('textbox', { name: 'Summary' })).toHaveValue(
    'Heir to the northern seat.',
  )
  await expect(page.getByTestId('tags-tokens')).toContainText('nobility')
  await expect(page.getByTestId('aliases-tokens')).not.toContainText('The Heir')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Prince')
  await expect(page.getByTestId('canon-idea')).toHaveAttribute('aria-pressed', 'true')

  // Everything optional starts off, and what is never copied is named.
  await expect(page.getByTestId('entry-copy-aliases')).not.toBeChecked()
  await expect(page.getByTestId('entry-copy-references')).not.toBeChecked()
  await expect(page.getByTestId('entry-copy-article')).not.toBeChecked()
  await expect(page.getByTestId('entry-copy-links')).toHaveCount(0)
  await expect(page.getByTestId('entry-copy-skipped')).toContainText('picture, relationships')

  // Asked for, the aliases come into the form, and the article lists every link it brings.
  await page.getByTestId('entry-copy-aliases').check()
  await expect(page.getByTestId('aliases-tokens')).toContainText('The Heir')
  await page.getByTestId('entry-copy-article').check()
  const links = page.getByTestId('entry-copy-links')
  await expect(links).toContainText('2 links')
  await expect(links).toContainText(
    `Rivendell → /app/universes/${w.universeId}/lore/${w.rivendell.id} (inside Lorex)`,
  )
  await expect(links).toContainText('the map → https://example.test/map')

  const copyId = await create(page, w.universeId)
  expect(copyId).not.toBe(w.source.id)
  await expect(page.getByTestId('entry-name')).toHaveText('Akron Wright (copy)')
  await expect(page.getByTestId('entry-error')).toHaveCount(0)

  const copy = await readEntry(page, w.u, copyId)
  expect(copy.entityTypeId).toBe(w.character)
  expect(copy.canonStatus).toBe(0)
  expect(copy.summary).toBe('Heir to the northern seat.')
  expect(copy.aliases).toEqual(['The Heir'])
  expect(copy.tags).toEqual(['nobility'])
  expect(copy.fields.find((field) => field.fieldDefinitionId === w.title)?.text).toBe('Prince')
  expect(
    copy.fields.find((field) => field.fieldDefinitionId === w.home)?.referencedEntityId ?? null,
  ).toBeNull()

  // The article is the source's, saved as the copy's own first version; the copy's history starts at its creation.
  const article = (await (await page.request.get(`${w.u}/entities/${copyId}/article`)).json()) as {
    content: string
  }
  expect(JSON.parse(article.content)).toEqual(JSON.parse(w.article))
  const articleVersions = (await (
    await page.request.get(`${w.u}/entities/${copyId}/article/revisions`)
  ).json()) as unknown[]
  expect(articleVersions).toHaveLength(1)
  const versions = (await (
    await page.request.get(`${w.u}/entities/${copyId}/revisions`)
  ).json()) as { kind: number }[]
  expect(versions).toHaveLength(1)

  // The source is untouched.
  const source = await readEntry(page, w.u, w.source.id)
  expect(source.name).toBe('Akron Wright')
  expect(source.canonStatus).toBe(2)
  expect(
    source.fields.find((field) => field.fieldDefinitionId === w.home)?.referencedEntityId,
  ).toBe(w.rivendell.id)
})

test('links to other entries are copied only when chosen, and a new type takes nothing but the basics', async ({
  page,
}) => {
  const w = await world(page)
  await duplicate(page, w.universeId, w.source.id)

  // Chosen, the Home link is in the form, named.
  await page.getByTestId('entry-copy-references').check()
  await expect(page.getByTestId('entry-copy')).toContainText('Home: Rivendell')
  await expect(page.getByTestId('entry-form')).toContainText('Rivendell')

  // Another type: its fields start empty, links stay with the source's type, and its required field is asked for.
  await page.getByLabel('Entry type').selectOption({ label: 'Location' })
  await expect(page.getByTestId('entry-copy-references')).toBeDisabled()
  await expect(page.getByTestId('entry-copy-references')).not.toBeChecked()
  await expect(page.getByLabel('Region (required)')).toHaveValue('')
  await page.getByTestId('save-entity').click()
  await expect(page.getByTestId('entry-error')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/lore/new\\?from=${w.source.id}$`))

  await page.getByLabel('Region (required)').fill('Rhovanion')
  const copyId = await create(page, w.universeId)
  const copy = await readEntry(page, w.u, copyId)
  expect(copy.entityTypeId).toBe(w.location)
  expect(copy.summary).toBe('Heir to the northern seat.')
  expect(copy.fields.map((field) => field.fieldDefinitionId)).toEqual([w.region])

  // Back on the source's type, the link copies.
  await duplicate(page, w.universeId, w.source.id)
  await page.getByTestId('entry-copy-references').check()
  const linkedId = await create(page, w.universeId)
  const linked = await readEntry(page, w.u, linkedId)
  expect(
    linked.fields.find((field) => field.fieldDefinitionId === w.home)?.referencedEntityId,
  ).toBe(w.rivendell.id)
})

test('a source that cannot be read leaves a blank new entry and says so', async ({ page }) => {
  const w = await world(page)
  await page.goto(
    `/app/universes/${w.universeId}/lore/new?from=00000000-0000-0000-0000-000000000000`,
  )
  await expect(page.getByTestId('entry-copy-unavailable')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('')
})
