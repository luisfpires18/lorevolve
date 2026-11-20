import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #282: the Types screen manages the universe's reusable templates. Creating, editing and deleting one never
 * touches a game's types, and another universe's templates are not listed.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('tmpl')
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

async function universe(page: Page, name: string) {
  return api<{ id: string }>(page, 'POST', '/api/universes', { name, description: null })
}

test.describe('Types: Templates', () => {
  test('an owner creates, edits and deletes a template and the game types stay as they are', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page, unique('Templateworld '))
    const other = await universe(page, unique('Otherworld '))
    await api(page, 'POST', `/api/universes/${other.id}/type-templates`, {
      name: 'Elsewhere',
      description: null,
      icon: null,
      accentColor: null,
      parentId: null,
    })

    // Kind and lifecycle travel as numbers: 1 is Game and 1 is Active.
    const project = await api<{ id: string }>(page, 'POST', '/api/projects', {
      name: unique('Game '),
      kind: 1,
      lifecycle: 1,
      subtype: null,
      summary: '',
      universeId: world.id,
      expectedVersion: null,
    })
    await api(page, 'POST', `/api/projects/${project.id}/entity-types`, {
      name: 'Unit',
      description: null,
      icon: null,
      accentColor: null,
      parentId: null,
    })
    const gameTypes = async () =>
      JSON.stringify(await api(page, 'GET', `/api/projects/${project.id}/entity-types`))
    const before = await gameTypes()

    await page.goto(`/app/universes/${world.id}/types?context=templates`)
    await expect(page.getByTestId('type-templates-empty')).toBeVisible()
    await expect(page.getByText('Elsewhere')).toHaveCount(0)

    const name = unique('Kit ')
    await page.getByTestId('template-new').click()
    await page.getByTestId('type-name').fill(name)
    await page.getByTestId('save-type').click()
    const row = page.locator(`[data-template-name="${name}"]`)
    await expect(row).toBeVisible()
    await expect(row.locator('.chip')).toHaveText('Universe template')

    // Fields: text, select with options, image.
    await row.getByRole('button', { name: /^Fields/ }).click()
    const add = row.locator('[data-testid^="template-field-add-"]')
    await add.click()
    await page.getByTestId('project-field-new-name').fill('Label')
    await page.getByTestId('project-field-new-save').click()
    await expect(row.getByText('Label')).toBeVisible()

    await add.click()
    await page.getByTestId('project-field-new-name').fill('Tier')
    await page.getByTestId('project-field-new-kind').selectOption({ label: 'Choose one' })
    await page.getByTestId('project-field-new-options').fill('Low\nHigh')
    await page.getByTestId('project-field-new-save').click()
    await expect(row.getByText('Tier')).toBeVisible()

    await add.click()
    await page.getByTestId('project-field-new-name').fill('Portrait')
    await page.getByTestId('project-field-new-kind').selectOption({ label: 'Image' })
    await page.getByTestId('project-field-new-save').click()
    await expect(row.getByText('Portrait')).toBeVisible()

    // A duplicate name is refused with the reason.
    await add.click()
    await page.getByTestId('project-field-new-name').fill('Label')
    await page.getByTestId('project-field-new-save').click()
    await expect(page.getByTestId('type-templates-failed')).toBeVisible()
    await page.getByTestId('project-field-new-cancel').click()

    // Edit a field.
    await row.locator('[data-testid^="template-field-actions-"]').first().click()
    await page.locator('[data-testid^="template-field-edit-"]').first().click()
    await page.getByTestId('project-field-new-name').fill('Caption')
    await page.getByTestId('project-field-new-save').click()
    await expect(row.getByText('Caption')).toBeVisible()

    // Edit the template and reload.
    const renamed = `${name}2`
    await row.locator('[data-testid^="template-edit-"]').click()
    await page.getByTestId('type-name').fill(renamed)
    await page.getByTestId('save-type').click()
    // The save lands before the reload, or the reload can drop it.
    await expect(page.locator(`[data-template-name="${renamed}"]`)).toBeVisible()
    await page.reload()
    await expect(page.locator(`[data-template-name="${renamed}"]`)).toBeVisible()
    expect(await gameTypes()).toBe(before)

    // Delete: the confirm says game types are kept.
    const renamedRow = page.locator(`[data-template-name="${renamed}"]`)
    await renamedRow.locator('[data-testid^="template-actions-"]').click()
    await renamedRow.locator('[data-testid^="template-delete-"]').click()
    await expect(
      page.getByText('Existing game types made from it are kept as they are.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Delete template' }).last().click()
    await expect(page.locator(`[data-template-name="${renamed}"]`)).toHaveCount(0)
    expect(await gameTypes()).toBe(before)

    // Lore and Gaming still work.
    await page.getByTestId('types-context-lore').click()
    await expect(page.getByTestId('types-tab-lore')).toBeVisible()
    await page.getByTestId('types-context-gaming').click()
    await expect(page.getByTestId('project-schema')).toBeVisible()
  })
})
