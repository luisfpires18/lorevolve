import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import {
  archiveField,
  discardField,
  editField,
  fieldDialog,
  fieldSummary,
  openFields,
} from './support/typeFields'

/**
 * Managing a Lore type's fields (Issue #39): Fields lists what the type has and opens no form on its own; Edit changes a
 * field in place, keeping its values; Archive hides one and keeps everything it holds; Restore brings it back, or says
 * why it can't come back required; Delete is for a field nothing uses.
 *
 * Each test registers its own account and builds its own universe through the API, then works on the Types screen.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('fielder')
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

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

/** A universe with Kingdoms and Runes, a required Kingdom field on Character open to any type, and Mara of Erandor. */
async function world(page: Page) {
  const u = (await post(page, '/api/universes', { name: unique('Arkhos '), description: null })).id
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
  const kingdoms = await type('Kingdoms')
  const runes = await type('Runes')
  const field = async (name: string, kind: number, isRequired: boolean) => {
    const updated = await post<{ fields: { id: string; name: string }[] }>(
      page,
      `/api/universes/${u}/entity-types/${character}/fields`,
      { name, kind, isRequired, displayOrder: null, defaultValue: null, options: null },
    )
    return updated.fields.find((each) => each.name === name)!.id
  }
  const kingdom = await field('Kingdom', 7, true)
  const entry = async (typeId: string, name: string, fields: unknown[] = []) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: typeId,
        name,
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields,
      })
    ).id
  const erandor = await entry(kingdoms, 'Erandor')
  const vael = await entry(kingdoms, 'Vael')
  await entry(runes, 'Nanite Rune')
  const link = (entityId: string) => ({
    fieldDefinitionId: kingdom,
    text: null,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: entityId,
  })
  const mara = await entry(character, 'Mara', [link(erandor)])
  return { u, character, kingdoms, kingdom, erandor, vael, mara, field, entry, link }
}

/** The names a picker offers right now, once it has settled. */
async function offered(page: Page, label: string) {
  const picker = page.locator('.picker').filter({ has: page.getByText(label, { exact: true }) })
  await picker.getByTestId('picker-input').click()
  const list = picker.getByRole('listbox')
  await expect(list.getByRole('option').first()).toBeVisible()
  return (
    await list
      .getByRole('option')
      .evaluateAll((options) =>
        options.map((option) =>
          (option.getAttribute('data-testid') ?? '').replace('picker-option-', ''),
        ),
      )
  ).sort()
}

function noSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('a type’s fields', () => {
  test('Fields lists Kingdom without a form, and Edit limits it to Kingdoms keeping Mara’s Erandor', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)

    // ---------- Fields is a list, not an empty creation form ----------
    const panel = await openFields(page, w.u, 'Character')
    await expect(fieldDialog(page)).toHaveCount(0)
    await expect(panel.getByTestId('field-row-Kingdom')).toBeVisible()
    await expect(fieldSummary(page, 'Kingdom')).toHaveText(
      'Link to an entity · Required · Links to any Lore type',
    )
    await expect(panel.getByRole('button', { name: 'Edit Kingdom' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'More actions for Kingdom' })).toBeVisible()
    await expect(panel.getByTestId('new-field-Character')).toHaveText('Add field')

    // ---------- Cancel keeps nothing; the field is as it was ----------
    await page.getByTestId('edit-field-Kingdom').click()
    await expect(fieldDialog(page).getByTestId('field-name')).toBeFocused()
    await fieldDialog(page).getByTestId('field-name').fill('Realm')
    await discardField(page)
    await expect(page.getByTestId('edit-field-Kingdom')).toBeFocused()
    await expect(page.getByTestId('field-row-Kingdom')).toBeVisible()

    // ---------- Edit: limited to Kingdoms, same field, same value ----------
    const dialog = fieldDialog(page)
    await page.getByTestId('edit-field-Kingdom').click()
    await expect(dialog.getByTestId('field-target')).toHaveValue('any')
    // It holds a value, so its kind is shown and cannot change.
    await expect(dialog.getByTestId('field-kind')).toBeDisabled()
    await dialog.getByTestId('field-target').selectOption({ label: 'Kingdoms' })
    await dialog.getByTestId('save-field').click()
    await expect(dialog).toHaveCount(0)
    await expect(fieldSummary(page, 'Kingdom')).toHaveText(
      'Link to an entity · Required · Links to Kingdoms',
    )
    await expect(page.getByTestId('fields-notice-Character')).toHaveText(
      'Saved the field “Kingdom”.',
    )

    const types = (await (await page.request.get(`/api/universes/${w.u}/entity-types`)).json()) as {
      id: string
      fields: { id: string; targetEntityTypeId: string | null }[]
    }[]
    const kept = types
      .find((type) => type.id === w.character)!
      .fields.find((f) => f.id === w.kingdom)!
    expect(kept.targetEntityTypeId).toBe(w.kingdoms)

    // ---------- The entry keeps Erandor, and its picker offers Kingdoms only ----------
    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await expect(page.getByTestId('entry-fields')).toContainText('Erandor')
    await page.getByTestId('edit-entity').click()
    const picker = page
      .locator('.picker')
      .filter({ has: page.getByText('Kingdom (required)', { exact: true }) })
    await picker.getByTestId('picker-clear').click()
    await expect.poll(() => offered(page, 'Kingdom (required)')).toEqual(['Erandor', 'Vael'])
  })

  test('archiving Kingdom hides it, an unrelated save keeps Erandor, and restoring brings it back', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await openFields(page, w.u, 'Character')

    // The confirmation says what archiving does to a populated, required field.
    const said = await archiveField(page, 'Kingdom')
    expect(said).toContain('Character entries will stop showing it.')
    expect(said).toContain('1 entry keeps its value')
    expect(said).toContain('you can save entries without it')
    await expect(page.getByTestId('fields-notice-Character')).toContainText('Archived “Kingdom”.')

    const archived = page.getByTestId('archived-fields-Character')
    await expect(archived.locator('summary')).toHaveText('Archived fields (1)')
    await archived.locator('summary').click()
    await expect(archived.getByTestId('archived-field-Kingdom')).toContainText(
      'Link to an entity · Previously required · Values in 1 entry',
    )

    // Out of the entry: the description is edited and saved without it.
    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await expect(page.getByTestId('entry-fields')).toHaveCount(0)
    await page.getByTestId('edit-entity').click()
    await expect(
      page
        .locator('.picker')
        .filter({ has: page.getByText('Kingdom (required)', { exact: true }) }),
    ).toHaveCount(0)
    await page.getByLabel('Summary').fill('Heir of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('edit-entity')).toBeVisible()

    // Restored: the same field, and Mara's Erandor with it.
    await openFields(page, w.u, 'Character')
    await page.getByTestId('archived-fields-Character').locator('summary').click()
    await page.getByTestId('restore-field-Kingdom').click()
    await expect(page.getByTestId('field-row-Kingdom')).toBeVisible()
    await expect(page.getByTestId('archived-fields-Character')).toHaveCount(0)
    await expect(page.getByTestId('fields-notice-Character')).toHaveText(
      'Restored “Kingdom” with its values.',
    )

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await expect(page.getByTestId('entry-fields')).toContainText('Erandor')
    await expect(page.getByText('Heir of the drowned coast.')).toBeVisible()
  })

  test('a required field missing on a new entry comes back only as optional, when the author says so', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await openFields(page, w.u, 'Character')
    await archiveField(page, 'Kingdom')

    // Made while Kingdom was archived, so it has none.
    await w.entry(w.character, 'Oren')

    await page.reload()
    await page.getByTestId('fields-Character').click()
    await page.getByTestId('archived-fields-Character').locator('summary').click()
    await page.getByTestId('restore-field-Kingdom').click()
    const offer = page.getByTestId('restore-offer-Kingdom')
    await expect(offer).toContainText(
      "1 Character entry has no Kingdom, so it can't come back as required.",
    )
    await expect(page.getByTestId('archived-field-Kingdom')).toBeVisible()

    await offer.getByTestId('restore-optional-Kingdom').click()
    await expect(fieldSummary(page, 'Kingdom')).toHaveText(
      'Link to an entity · Optional · Links to any Lore type',
    )
    await expect(page.getByTestId('fields-notice-Character')).toContainText('as optional')

    // Making it required again is refused, with the count, until Oren has a kingdom.
    const refused = await editField(page, 'Kingdom', { required: true }, { saved: false })
    await expect(refused.getByTestId('field-dialog-error')).toContainText(
      "1 Character entry has no Kingdom yet, so it can't be required.",
    )
    await discardField(page)
  })

  test('a field with values is not deleted and points to archiving; an empty one is, once confirmed', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await w.field('Motto', 0, false)
    await openFields(page, w.u, 'Character')

    // Kingdom holds Mara's value: no confirmation it could only fail, the reason instead.
    await page.getByTestId('field-actions-Kingdom').click()
    await page.getByTestId('delete-field-Kingdom').click()
    const blocked = page.getByTestId('field-blocked-Kingdom')
    await expect(blocked).toHaveText(
      /This field contains a value in 1 entry\. Archive it to hide it without losing its data\./,
    )
    await expect(blocked.getByRole('link', { name: 'Show Character entries' })).toBeVisible()
    await expect(page.getByTestId('field-row-Kingdom')).toBeVisible()

    // Motto holds nothing: one confirmation, and it is gone.
    let asked = ''
    page.once('dialog', (dialog) => {
      asked = dialog.message()
      void dialog.accept()
    })
    await page.getByTestId('field-actions-Motto').click()
    await page.getByTestId('delete-field-Motto').click()
    await expect(page.getByTestId('field-row-Motto')).toHaveCount(0)
    expect(asked).toContain("This can't be undone.")
    await expect(page.getByTestId('fields-notice-Character')).toHaveText(
      'Deleted the field “Motto”.',
    )

    // Archive instead, from the refusal itself.
    await page.getByTestId('field-actions-Kingdom').click()
    await page.getByTestId('delete-field-Kingdom').click()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('archive-instead-Kingdom').click()
    await expect(page.getByTestId('field-row-Kingdom')).toHaveCount(0)
    await expect(page.getByTestId('archived-fields-Character')).toBeVisible()
  })

  test('a new field is added from Add field, and a link field asks what it links to first', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await openFields(page, w.u, 'Character')

    // The keyboard opens it, and Escape on an untouched draft closes it with the focus back on Add field.
    await page.getByTestId('new-field-Character').focus()
    await page.keyboard.press('Enter')
    await expect(fieldDialog(page).getByTestId('field-name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(fieldDialog(page)).toHaveCount(0)
    await expect(page.getByTestId('new-field-Character')).toBeFocused()

    await page.getByTestId('new-field-Character').click()
    const dialog = fieldDialog(page)
    await dialog.getByTestId('field-name').fill('Liege')
    await dialog.getByTestId('field-kind').selectOption({ label: 'Link to an entity' })
    await dialog.getByTestId('save-field').click()
    await expect(dialog).toContainText('Choose what this field can link to.')
    await dialog.getByTestId('field-target').selectOption({ label: 'Any Lore type' })
    await dialog.getByTestId('save-field').click()
    await expect(dialog).toHaveCount(0)
    await expect(fieldSummary(page, 'Liege')).toHaveText(
      'Link to an entity · Optional · Links to any Lore type',
    )

    // The menu works from the keyboard too: open, and the first item has the focus.
    await page.getByTestId('field-actions-Liege').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('archive-field-Liege')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('field-actions-Liege')).toBeFocused()
  })

  for (const width of [390, 360]) {
    test(`at ${width}px the field list, its menu and the field drawer fit`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await context.newPage()
      await account(page)
      const w = await world(page)
      await openFields(page, w.u, 'Character')
      await expect(page.getByTestId('edit-field-Kingdom')).toBeVisible()
      expect(await noSideways(page)).toBeLessThanOrEqual(0)

      await page.getByTestId('field-actions-Kingdom').click()
      await expect(page.getByTestId('archive-field-Kingdom')).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByTestId('edit-field-Kingdom').click()
      await expect(fieldDialog(page).getByTestId('save-field')).toBeVisible()
      expect(await noSideways(page)).toBeLessThanOrEqual(0)
      await context.close()
    })
  }
})
