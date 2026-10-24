import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { acceptConfirm } from './support/confirm'
import { openFields } from './support/typeFields'
import { entryNames, entryText, storedZip } from './support/zip'

/**
 * Optional sections for a type's fields (Issue #26): a type without any reads exactly as before; Sections on the Types
 * screen names, orders, folds and removes them and moves fields between them without touching a field; the entry form and
 * the entry show each section as a fold, required and refused fields stay findable while folded, and a refused save opens
 * the section and focuses the field. An archived field returns to its section; a backup carries sections from format 31,
 * and an older one restores every field ungrouped.
 *
 * Each test registers its own account and builds its universe through the API.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('sectioner')
  const password = makeTestPassword()
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { username, email: `${username}@example.test`, password },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.post('/api/auth/login', { data: { usernameOrEmail: username, password } })
    ).ok(),
  ).toBe(true)
}

async function call<T = unknown>(page: Page, method: 'POST' | 'PUT', path: string, data: unknown) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

interface TypeRead {
  id: string
  name: string
  fieldLayoutVersion: number
  fieldSections: { id: string; name: string }[]
  fields: {
    id: string
    name: string
    version: number
    displayOrder: number
    sectionId: string | null
  }[]
  archivedFields: { id: string; name: string; sectionId: string | null }[]
}

async function character(page: Page, u: string) {
  const types = (await (
    await page.request.get(`/api/universes/${u}/entity-types`)
  ).json()) as TypeRead[]
  return types.find((type) => type.name === 'Character')!
}

/** A universe whose Character has Title, Strength and Weapon, and Mara with a Title. */
async function world(page: Page) {
  const u = (
    await call<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Sectioned '),
      description: null,
    })
  ).id
  const typeId = (await character(page, u)).id
  const field = async (name: string, kind = 0, isRequired = false) => {
    const updated = await call<TypeRead>(
      page,
      'POST',
      `/api/universes/${u}/entity-types/${typeId}/fields`,
      {
        name,
        kind,
        isRequired,
        displayOrder: null,
        defaultValue: null,
        options: null,
      },
    )
    return updated.fields.find((each) => each.name === name)!.id
  }
  const text = (fieldDefinitionId: string, value: string) => ({
    fieldDefinitionId,
    text: value,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
  })
  const title = await field('Title')
  const strength = await field('Strength', 2)
  const weapon = await field('Weapon')
  const mara = (
    await call<{ id: string }>(page, 'POST', `/api/universes/${u}/entities`, {
      entityTypeId: typeId,
      name: 'Mara',
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [text(title, 'Queen'), text(weapon, 'Spear')],
    })
  ).id
  const layout = async (
    sections: { name: string; fieldIds: string[]; startsCollapsed?: boolean }[],
  ) => {
    const current = await character(page, u)
    return call<TypeRead>(page, 'PUT', `/api/universes/${u}/entity-types/${typeId}/field-layout`, {
      expectedVersion: current.fieldLayoutVersion,
      sections: sections.map((section) => ({
        id: current.fieldSections.find((each) => each.name === section.name)?.id ?? null,
        startsCollapsed: false,
        ...section,
      })),
    })
  }
  return { u, typeId, title, strength, weapon, mara, field, layout }
}

function noSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('field sections', () => {
  test('a type with no sections reads as before, in Types, the form and the entry', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)

    const panel = await openFields(page, w.u, 'Character')
    await expect(
      panel.getByRole('list', { name: 'Fields of Character' }).getByRole('listitem'),
    ).toHaveCount(3)
    await expect(panel.locator('.fieldgroup')).toHaveCount(0)
    await expect(panel.getByTestId('new-field-Character')).toHaveText('Add field')

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await expect(page.locator('dl[data-testid="entry-fields"]')).toContainText('Queen')
    await expect(page.locator('.fieldsection')).toHaveCount(0)
    await page.getByTestId('edit-entity').click()
    await expect(page.getByLabel('Strength')).toBeVisible()
    await expect(page.locator('.fieldsection')).toHaveCount(0)
  })

  test('Sections names, orders, folds and removes sections, and moves fields without changing them', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    const before = await character(page, w.u)

    const panel = await openFields(page, w.u, 'Character')
    await page.getByTestId('arrange-sections-Character').click()
    const dialog = page.getByTestId('sections-dialog')
    await expect(dialog).toBeVisible()

    // A new section's name has the focus; a blank one is refused here, before anything is sent.
    await dialog.getByTestId('add-section').click()
    await expect(dialog.getByTestId('section-name-0')).toBeFocused()
    await dialog.getByTestId('save-sections').click()
    await expect(dialog.getByText('Give the section a name.')).toBeVisible()
    await dialog.getByTestId('section-name-0').fill('Combat')
    await dialog.getByTestId('section-collapsed-0').check()
    await dialog.getByTestId('add-section').click()
    await dialog.getByTestId('section-name-1').fill('Story')
    await dialog.getByTestId('place-Strength').selectOption({ label: 'Combat' })
    await dialog.getByTestId('place-Weapon').selectOption({ label: 'Combat' })
    await dialog.getByTestId('place-Title').selectOption({ label: 'Story' })
    await dialog.getByRole('button', { name: 'Move Story up' }).click()
    await expect(dialog.getByTestId('section-name-0')).toHaveValue('Story')
    await dialog.getByTestId('save-sections').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('fields-notice-Character')).toHaveText(
      'Saved the sections of Character.',
    )

    // Story, then Combat; nothing ungrouped; each field under its section.
    await expect(panel.locator('.fieldgroup__head')).toHaveText(['Story', 'CombatStarts collapsed'])
    await expect(
      panel.getByRole('list', { name: 'Fields of Character in no section' }),
    ).toHaveCount(0)
    await expect(
      panel.getByTestId('type-section-Story').getByTestId('field-row-Title'),
    ).toBeVisible()
    await expect(
      panel.getByTestId('type-section-Combat').getByTestId('field-row-Weapon'),
    ).toBeVisible()

    // Every field kept its id, place and version: a layout is not an edit of a field.
    const after = await character(page, w.u)
    expect(after.fields.map((field) => [field.id, field.displayOrder, field.version])).toEqual(
      before.fields.map((field) => [field.id, field.displayOrder, field.version]),
    )

    // Removing Story puts Title back first, with no heading; renaming Combat keeps its fields.
    await page.getByTestId('arrange-sections-Character').click()
    await dialog.getByTestId('section-remove-0').click()
    await expect(dialog.getByTestId('place-Title')).toHaveValue('')
    await dialog.getByTestId('section-name-0').fill('Battle')
    await dialog.getByTestId('save-sections').click()
    await expect(dialog).toHaveCount(0)
    await expect(
      panel
        .getByRole('list', { name: 'Fields of Character in no section' })
        .getByTestId('field-row-Title'),
    ).toBeVisible()
    await expect(panel.locator('.fieldgroup__head')).toHaveText(['BattleStarts collapsed'])
    await expect(
      panel.getByTestId('type-section-Battle').getByTestId('field-row-Strength'),
    ).toBeVisible()
  })

  test('a required field in a folded section is findable, and a refused save opens it and focuses the field', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    // Added after Mara, so she has no Oath: saving her is refused until she does.
    const oath = await w.field('Oath', 0, true)
    await w.layout([
      { name: 'Combat', fieldIds: [w.strength, w.weapon], startsCollapsed: true },
      { name: 'Vows', fieldIds: [oath], startsCollapsed: true },
    ])

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)

    // On the entry: Title first with no heading, Combat folded until opened; opening it is the reader's alone.
    const rail = page.getByRole('complementary', { name: 'Details' })
    const combat = rail.getByTestId('field-section-Combat')
    await expect(rail.locator('.facts').first()).toContainText('Queen')
    await expect(combat).not.toHaveAttribute('open')
    await expect(combat.getByText('Spear')).toBeHidden()
    await combat.locator('summary').click()
    await expect(combat.getByText('Spear')).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('complementary', { name: 'Details' }).getByTestId('field-section-Combat'),
    ).not.toHaveAttribute('open')

    // In the form, the folded Vows says it holds a required field.
    await page.getByTestId('edit-entity').click()
    const vows = page.getByTestId('field-section-Vows')
    await expect(vows).not.toHaveAttribute('open')
    await expect(vows.locator('summary')).toContainText('1 field · 1 required')

    await page.getByTestId('save-entity').click()
    await expect(vows).toHaveAttribute('open', '')
    await expect(vows.locator('summary')).toContainText('1 needs attention')
    await expect(page.getByLabel('Oath (required)')).toBeFocused()
    await expect(vows.getByText('Oath is required.')).toBeVisible()
    // The other folded section, which holds nothing refused, stays as it was.
    await expect(page.getByTestId('field-section-Combat')).not.toHaveAttribute('open')

    await page.getByLabel('Oath (required)').fill('To the crown')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('edit-entity')).toBeVisible()
  })

  test('an archived field keeps its section and returns to it when restored', async ({ page }) => {
    await account(page)
    const w = await world(page)
    await w.layout([{ name: 'Combat', fieldIds: [w.strength, w.weapon] }])

    const panel = await openFields(page, w.u, 'Character')
    await page.getByTestId('field-actions-Strength').click()
    await page.getByTestId('archive-field-Strength').click()
    await acceptConfirm(page)
    await expect(panel.getByTestId('field-row-Strength')).toHaveCount(0)

    const archived = panel.getByTestId('archived-fields-Character')
    await archived.locator('summary').click()
    await expect(archived.getByTestId('archived-field-Strength')).toContainText('In Combat')

    // A layout saved while it is archived keeps it there too.
    await page.getByTestId('arrange-sections-Character').click()
    await page.getByTestId('section-name-0').fill('Fighting')
    await page.getByTestId('save-sections').click()
    await expect(page.getByTestId('sections-dialog')).toHaveCount(0)

    await archived.getByTestId('restore-field-Strength').click()
    await expect(
      panel.getByTestId('type-section-Fighting').getByTestId('field-row-Strength'),
    ).toBeVisible()
    expect(
      (await character(page, w.u)).fields.find((field) => field.id === w.strength)!.sectionId,
    ).toBe((await character(page, w.u)).fieldSections[0].id)
  })

  test('on a phone the drawer and the folded form fit the screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await account(page)
    const w = await world(page)
    await w.layout([
      { name: 'A section with a long name for a narrow screen', fieldIds: [w.strength, w.weapon] },
    ])

    await openFields(page, w.u, 'Character')
    await page.getByTestId('arrange-sections-Character').click()
    const dialog = page.getByTestId('sections-dialog')
    await expect(dialog.getByRole('button', { name: /Remove A section/ })).toBeVisible()
    await expect(dialog.getByTestId('place-Weapon')).toBeVisible()
    expect(await noSideways(page)).toBeLessThanOrEqual(0)
    await dialog.getByTestId('cancel-sections').click()

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await page.getByTestId('edit-entity').click()
    const fold = page.getByTestId('field-section-A section with a long name for a narrow screen')
    await expect(fold.locator('summary')).toContainText('2 fields')
    // Open at first, as its author left it; a tap folds it and another opens it again.
    await expect(page.getByLabel('Strength')).toBeVisible()
    expect(await noSideways(page)).toBeLessThanOrEqual(0)
    await fold.locator('summary').click()
    await expect(page.getByLabel('Strength')).toBeHidden()
    await fold.locator('summary').click()
    await expect(page.getByLabel('Strength')).toBeVisible()
  })

  test('a backup restores its sections, and a version 30 backup restores every field ungrouped', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await w.layout([{ name: 'Combat', fieldIds: [w.strength, w.weapon], startsCollapsed: true }])

    const archive = await (await page.request.get(`/api/universes/${w.u}/export`)).body()
    const restore = async (file: Buffer) => {
      const validated = await page.request.put('/api/backups/validate', {
        headers: { 'content-type': 'application/zip' },
        data: file,
      })
      expect(validated.status(), await validated.text()).toBe(200)
      const { token } = (await validated.json()) as { token: string }
      const restored = await page.request.post('/api/backups/restore', {
        data: { token, name: unique('Restored ') },
      })
      expect(restored.status()).toBe(201)
      return ((await restored.json()) as { id: string }).id
    }

    // Format 31, as Lorex writes it: Combat comes back, under a new id, with Strength and Weapon.
    const current = await restore(archive)
    const copy = await openFields(page, current, 'Character')
    await expect(
      copy.getByTestId('type-section-Combat').getByTestId('field-row-Weapon'),
    ).toBeVisible()
    expect((await character(page, current)).fieldSections[0].id).not.toBe(
      (await character(page, w.u)).fieldSections[0].id,
    )

    // The same file as version 30 wrote it: no sections member, no section on a field.
    expect(entryNames(archive)).toEqual(['backup.json'])
    const document = JSON.parse(entryText(archive, 'backup.json'))
    document.formatVersion = 30
    for (const type of document.payload.entityTypes) {
      delete type.fieldSections
      for (const field of type.fields) delete field.sectionId
    }
    const older = await restore(storedZip({ 'backup.json': Buffer.from(JSON.stringify(document)) }))
    const flat = await openFields(page, older, 'Character')
    await expect(
      flat.getByRole('list', { name: 'Fields of Character' }).getByRole('listitem'),
    ).toHaveCount(3)
    await expect(flat.locator('.fieldgroup')).toHaveCount(0)
  })
})
