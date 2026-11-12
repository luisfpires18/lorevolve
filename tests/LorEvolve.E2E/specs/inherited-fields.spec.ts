import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { showFields } from './support/typeFields'

/**
 * A nested type inherits the fields of every type above it (ADR 0007 amendment, 2026-11-12): its entries are written with
 * them, and the Types screen shows them read-only above its own.
 */

const unique = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

async function account(page: Page) {
  const username = unique('inherit')
  const password = makeTestPassword()
  await post(page, '/api/auth/register', { username, email: `${username}@example.test`, password })
  await post(page, '/api/auth/login', { usernameOrEmail: username, password })
}

test('an entry of a nested type is written with its parent fields, shown read-only on the nested type', async ({
  page,
}) => {
  await account(page)
  const u = (await post(page, '/api/universes', { name: unique('Arkhos '), description: null })).id
  const type = (name: string, parentId: string | null) =>
    post(page, `/api/universes/${u}/entity-types`, {
      name,
      description: null,
      icon: null,
      accentColor: null,
      displayOrder: null,
      parent: parentId ? { id: parentId } : null,
    })
  const weapons = await type('Weapons', null)
  const chaos = await type('Weapons of Chaos', weapons.id)
  await post(page, `/api/universes/${u}/entity-types/${weapons.id}/fields`, {
    name: 'Damage',
    kind: 0,
    isRequired: false,
    displayOrder: null,
    defaultValue: null,
    options: null,
  })

  // The Types screen: Damage under "From Weapons" on the nested type, with no way to edit it there.
  await page.goto(`/app/universes/${u}/types`)
  const panel = await showFields(page, 'Weapons of Chaos')
  const inherited = panel.getByTestId('inherited-fields-Weapons')
  await expect(inherited).toContainText('From Weapons')
  await expect(inherited.getByTestId('inherited-field-Damage')).toBeVisible()
  await expect(panel.getByTestId('edit-field-Damage')).toHaveCount(0)

  // A new Weapons of Chaos entry: Damage is in its form and kept on save.
  await page.goto(`/app/universes/${u}/lore/new?type=${chaos.id}`)
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Sunder')
  await page.getByLabel('Damage').fill('Cleaves stone')
  await page.getByTestId('save-entity').click()
  await expect(page).not.toHaveURL(/\/lore\/new/)
  await expect(page.getByText('Cleaves stone')).toBeVisible()
})
