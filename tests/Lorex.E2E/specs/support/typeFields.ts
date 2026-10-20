import { expect, type Locator, type Page } from '@playwright/test'

/**
 * A type's fields on the Types screen (Issue #39): Fields lists what the type has, Add field and each field's Edit open the
 * field drawer, and a field's menu holds Archive and Delete. Archived fields fold away under "Archived fields (N)".
 *
 * Not a spec.
 */

/** What to put in the field drawer. Labels are the ones the selects show; `meaning: 'None'` clears a meaning. */
export interface FieldDraft {
  name?: string
  kind?: string
  options?: string
  target?: string
  meaning?: string
  required?: boolean
}

/** Goes to the Types screen and opens one type's fields. */
export async function openFields(page: Page, universeId: string, typeName: string) {
  await page.goto(`/app/universes/${universeId}/types`)
  return showFields(page, typeName)
}

/** Opens one type's fields on the Types screen already shown, and hands back the panel. */
export async function showFields(page: Page, typeName: string) {
  await page.getByTestId(`fields-${typeName}`).click()
  const panel = page.getByTestId(`type-fields-${typeName}`)
  await expect(panel).toBeVisible()
  return panel
}

/** The open field drawer. */
export function fieldDialog(page: Page) {
  return page.getByTestId('field-dialog')
}

/** Fills the open drawer: the kind first, since it decides which other controls there are. */
export async function fillField(dialog: Locator, draft: FieldDraft) {
  if (draft.kind) await dialog.getByTestId('field-kind').selectOption({ label: draft.kind })
  if (draft.name !== undefined) await dialog.getByTestId('field-name').fill(draft.name)
  if (draft.options !== undefined) await dialog.getByTestId('field-options').fill(draft.options)
  if (draft.target) await dialog.getByTestId('field-target').selectOption({ label: draft.target })
  if (draft.meaning)
    await dialog.getByTestId('field-semantic').selectOption({ label: draft.meaning })
  if (draft.required !== undefined)
    await dialog.getByTestId('field-required').setChecked(draft.required)
}

/**
 * Adds a field to the type whose fields are open. Saved, the drawer closes; `saved: false` leaves it open on its error and
 * hands it back.
 */
export async function addField(
  page: Page,
  typeName: string,
  draft: FieldDraft,
  { saved = true }: { saved?: boolean } = {},
) {
  await page.getByTestId(`new-field-${typeName}`).click()
  const dialog = fieldDialog(page)
  await expect(dialog).toBeVisible()
  await fillField(dialog, draft)
  await dialog.getByTestId('save-field').click()
  if (saved) await expect(dialog).toHaveCount(0)
  else await expect(dialog.getByTestId('field-dialog-error')).toBeVisible()
  return dialog
}

/** Changes a listed field through its Edit, the same way as `addField`. */
export async function editField(
  page: Page,
  fieldName: string,
  draft: FieldDraft,
  { saved = true }: { saved?: boolean } = {},
) {
  await page.getByTestId(`edit-field-${fieldName}`).click()
  const dialog = fieldDialog(page)
  await expect(dialog).toBeVisible()
  await fillField(dialog, draft)
  await dialog.getByTestId('save-field').click()
  if (saved) await expect(dialog).toHaveCount(0)
  else await expect(dialog.getByTestId('field-dialog-error')).toBeVisible()
  return dialog
}

/** Closes the drawer without saving, saying yes to losing the draft. */
export async function discardField(page: Page) {
  page.once('dialog', (dialog) => void dialog.accept())
  await fieldDialog(page).getByTestId('cancel-field').click()
  await expect(fieldDialog(page)).toHaveCount(0)
}

/** A listed field's line: kind, required or optional, what it links to, its Canon meaning. */
export function fieldSummary(page: Page, fieldName: string) {
  return page.getByTestId(`field-summary-${fieldName}`)
}

/** Archives a listed field from its menu, saying yes to the confirmation, and hands back what the confirmation said. */
export async function archiveField(page: Page, fieldName: string) {
  let said = ''
  page.once('dialog', (dialog) => {
    said = dialog.message()
    void dialog.accept()
  })
  await page.getByTestId(`field-actions-${fieldName}`).click()
  await page.getByTestId(`archive-field-${fieldName}`).click()
  await expect(page.getByTestId(`field-row-${fieldName}`)).toHaveCount(0)
  return said
}
