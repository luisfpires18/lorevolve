import { expect, test, type Locator, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { fieldDialog, fieldSummary, fillField, showFields } from './support/typeFields'
import { acceptConfirm } from './support/confirm'

/**
 * Semantic groups of Lore types (Issue #36): chosen, created, renamed and deleted inside a type's own editor; used by a link
 * field as its allowed target and by Lore as a way in. A group is never told from a type by its name alone, and nothing an
 * author linked is ever dropped to make a change fit.
 *
 * Each test registers its own account and builds its own universe.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('grouper')
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
      await page.request.post('/api/auth/login', {
        data: { usernameOrEmail: username, password },
      })
    ).ok(),
  ).toBe(true)
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

interface Group {
  id: string
  name: string
  typeIds: string[]
}

async function world(page: Page) {
  const u = (
    await post(page, '/api/universes', {
      name: unique('Runeworld '),
      description: null,
    })
  ).id
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const type = async (name: string) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
      })
    ).id
  const elemental = await type('Elemental Runes')
  const corrupted = await type('Corrupted Runes')
  const kingdoms = await type('Kingdoms')
  const entry = async (typeId: string, name: string) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: typeId,
        name,
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
  return {
    u,
    character,
    elemental,
    corrupted,
    kingdoms,
    lava: await entry(elemental, 'Lava Rune'),
    blight: await entry(corrupted, 'Blight Rune'),
    arkazia: await entry(kingdoms, 'Arkazia'),
    mara: await entry(character, 'Mara'),
  }
}

type World = Awaited<ReturnType<typeof world>>

async function groups(page: Page, w: World) {
  return (await (
    await page.request.get(`/api/universes/${w.u}/entity-type-groups`)
  ).json()) as Group[]
}

async function openEditor(page: Page, typeName: string) {
  await page.getByTestId(`edit-type-${typeName}`).click()
  const dialog = page.getByTestId('edit-type-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function createGroupIn(dialog: Locator, name: string) {
  await dialog.getByTestId('type-group-add').selectOption({ label: 'New group…' })
  await dialog.getByTestId('type-group-new-name').fill(name)
  await dialog.getByTestId('type-group-new-name').press('Enter')
}

async function save(dialog: Locator) {
  await dialog.getByTestId('save-type').click()
  await expect(dialog).toHaveCount(0)
}

/** Runes made from Elemental Runes' editor and joined by Corrupted Runes', both through the UI. */
async function makeRunes(page: Page, w: World) {
  await page.goto(`/app/universes/${w.u}/types`)
  const first = await openEditor(page, 'Elemental Runes')
  await createGroupIn(first, 'Runes')
  await expect(first.getByTestId('type-group-chosen')).toHaveAttribute('data-group-name', 'Runes')
  await save(first)

  const second = await openEditor(page, 'Corrupted Runes')
  await second.getByTestId('type-group-add').selectOption({ label: 'Runes' })
  await save(second)

  const runes = (await groups(page, w)).find((group) => group.name === 'Runes')!
  expect(runes.typeIds.sort()).toEqual([w.elemental, w.corrupted].sort())
  return runes
}

function noSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('semantic groups', () => {
  test('a group is created and joined from the type editor, and a cancelled one is never made', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await makeRunes(page, w)

    // One group shown, another only on request.
    const editor = await openEditor(page, 'Elemental Runes')
    await expect(editor.getByTestId('type-group-add')).toHaveCount(0)
    await editor.getByTestId('type-group-another').click()
    await expect(editor.getByTestId('type-group-add')).toBeVisible()
    await createGroupIn(editor, 'Temporary')
    await expect(editor.getByTestId('type-group-chosen')).toHaveCount(2)

    // Cancelled: the drawer asks first, then nothing is created.
    await editor.getByTestId('cancel-type').click()
    await acceptConfirm(page)
    await expect(editor).toHaveCount(0)
    expect((await groups(page, w)).map((group) => group.name)).not.toContain('Temporary')

    // A new type with no group is fine: nothing is required.
    await page.getByTestId('new-type').click()
    const fresh = page.getByTestId('new-type-dialog')
    await fresh.getByTestId('type-name').fill('Spells')
    const before = (await groups(page, w)).flatMap((group) => group.typeIds).length
    await save(fresh)
    expect((await groups(page, w)).flatMap((group) => group.typeIds)).toHaveLength(before)
  })

  test('a link field limited to a group offers every member type, and Lore filters by the group', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await makeRunes(page, w)

    // ---------- The field: the group is offered as a group, not by its name alone ----------
    await showFields(page, 'Character')
    await page.getByTestId('new-field-Character').click()
    const dialog = fieldDialog(page)
    await fillField(dialog, { name: 'Required Rune', kind: 'Link to an entity' })
    const target = dialog.getByTestId('field-target')
    await expect(target.locator('optgroup[label="Groups"] option')).toContainText(['Runes (group)'])
    await target.selectOption({ label: 'Runes (group)' })
    await dialog.getByTestId('save-field').click()
    await expect(dialog).toHaveCount(0)
    await expect(fieldSummary(page, 'Required Rune')).toContainText('Links to any type in Runes')

    // ---------- The entry's picker offers both rune types and nothing else ----------
    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await page.getByTestId('edit-entity').click()
    const picker = page
      .locator('.picker')
      .filter({ has: page.getByText('Required Rune', { exact: true }) })
    await picker.getByTestId('picker-input').click()
    await expect(picker.getByRole('option')).toHaveCount(2)
    await expect(picker.getByTestId('picker-option-Lava Rune')).toBeVisible()
    await expect(picker.getByTestId('picker-option-Blight Rune')).toBeVisible()
    await picker.getByTestId('picker-option-Lava Rune').click()
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('Lava Rune')

    // ---------- Lore: the group is a way in, across its types ----------
    await page.goto(`/app/universes/${w.u}/lore`)
    const groupLink = page.getByTestId('lore-groups').locator('[data-group-name="Runes"]')
    await expect(groupLink).toHaveAccessibleName('Runes (group)')
    await groupLink.click()
    await expect(page).toHaveURL(/group=/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Runes')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)

    // A concrete type is still exactly itself.
    await page.goto(`/app/universes/${w.u}/lore?type=${w.elemental}`)
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(page.getByTestId('entity-card')).toHaveAttribute('data-entity-name', 'Lava Rune')

    // No group badge on an ordinary card.
    await expect(page.getByTestId('entity-card')).not.toContainText('Runes (group)')
  })

  test('links that rely on a group keep it whole, and a targeted group cannot be deleted', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    const runes = await makeRunes(page, w)
    const field = (
      await post<{ fields: { id: string; name: string }[] }>(
        page,
        `/api/universes/${w.u}/entity-types/${w.character}/fields`,
        {
          name: 'Required Rune',
          kind: 7,
          isRequired: false,
          displayOrder: null,
          defaultValue: null,
          options: null,
          targetGroupId: runes.id,
        },
      )
    ).fields.find((one) => one.name === 'Required Rune')!
    await post(page, `/api/universes/${w.u}/entities`, {
      entityTypeId: w.character,
      name: 'Mage',
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [{ fieldDefinitionId: field.id, referencedEntityId: w.lava }],
    })

    await page.goto(`/app/universes/${w.u}/types`)

    // Leaving the group: refused in the drawer, which stays open with the author's draft.
    const editor = await openEditor(page, 'Elemental Runes')
    await editor.getByTestId('type-group-remove-Runes').click()
    await editor.getByTestId('save-type').click()
    await expect(editor.getByTestId('type-dialog-error')).toContainText('Required Rune')
    await expect(editor).toBeVisible()
    expect((await groups(page, w)).find((group) => group.id === runes.id)!.typeIds).toContain(
      w.elemental,
    )

    // Deleting the group: asked, refused, and the field named.
    await editor.getByTestId('type-groups-manage').locator('summary').click()
    await editor.getByTestId('type-group-delete-Runes').click()
    await acceptConfirm(page, 'Corrupted Runes')
    await expect(editor.getByTestId('type-group-problem')).toContainText('Required Rune')
    expect((await groups(page, w)).map((group) => group.name)).toContain('Runes')

    // Renaming it changes the name everywhere and nothing else.
    await editor.getByTestId('type-group-rename-Runes').click()
    await editor.getByTestId('type-group-rename-input').fill('Runestones')
    await editor.getByTestId('type-group-rename-save').click()
    await expect(editor.getByTestId('type-group-rename-Runestones')).toBeVisible()
    const renamed = (await groups(page, w)).find((group) => group.id === runes.id)!
    expect(renamed.name).toBe('Runestones')
    expect(renamed.typeIds.sort()).toEqual([w.elemental, w.corrupted].sort())
  })

  test('the group controls fit a phone and work from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await account(page)
    const w = await world(page)
    await makeRunes(page, w)

    const editor = await openEditor(page, 'Kingdoms')
    const add = editor.getByTestId('type-group-add')
    await add.focus()
    await add.selectOption({ label: 'New group…' })
    await expect(editor.getByTestId('type-group-new-name')).toBeFocused()
    await page.keyboard.type('Realms')
    await page.keyboard.press('Enter')
    await expect(editor.getByTestId('type-group-chosen')).toHaveAttribute(
      'data-group-name',
      'Realms',
    )
    expect(await noSideways(page)).toBeLessThanOrEqual(0)
    await save(editor)

    await page.goto(`/app/universes/${w.u}/lore`)
    await page.getByTestId('lore-type-menu').click()
    await page
      .getByTestId('lore-type-menu-panel')
      .getByRole('link', { name: 'Realms (group)' })
      .click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    expect(await noSideways(page)).toBeLessThanOrEqual(0)
  })
})
