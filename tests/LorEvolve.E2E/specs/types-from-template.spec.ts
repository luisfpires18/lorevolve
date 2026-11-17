import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #283: a game type can be made from a universe template. The copy is independent, a name clash is refused with
 * the reason, and a universe without templates offers no such button.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('tfrom')
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

const typeBody = (name: string) => ({
  name,
  description: null,
  icon: null,
  accentColor: null,
  parentId: null,
})

// Kind and lifecycle travel as numbers: 1 is Game and 1 is Active.
const newGame = (page: Page, universeId: string) =>
  api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Game '),
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })

test.describe('Types: from a template', () => {
  test('a game type is copied from a template and stays independent of it', async ({ page }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Copyworld '),
      description: null,
    })
    const game = await newGame(page, world.id)
    const templateName = unique('Kit ')
    const template = await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${world.id}/type-templates`,
      typeBody(templateName),
    )
    await api(page, 'POST', `/api/universes/${world.id}/type-templates/${template.id}/fields`, {
      name: 'Label',
      kind: 0,
    })

    await page.goto(`/app/universes/${world.id}/types?context=gaming&game=${game.id}`)
    await page.getByTestId('project-type-from-template').click()
    await page.getByTestId('save-type-from-template').click()
    await expect(page.getByText(templateName).first()).toBeVisible()

    // The same name again is refused, with the reason under the name.
    await page.getByTestId('project-type-from-template').click()
    await page.getByTestId('save-type-from-template').click()
    await expect(page.getByTestId('type-from-template-error')).toBeVisible()
    await expect(page.getByText('already has a type with that name')).toBeVisible()

    // A name of the author's choice works.
    const chosen = unique('Copy ')
    await page.getByTestId('type-from-template-name').fill(chosen)
    await page.getByTestId('save-type-from-template').click()
    await expect(page.getByText(chosen).first()).toBeVisible()

    // The template is unchanged by either copy.
    await page.goto(`/app/universes/${world.id}/types?context=templates`)
    await expect(page.locator(`[data-template-name="${templateName}"]`)).toBeVisible()
    await expect(page.locator(`[data-template-name="${chosen}"]`)).toHaveCount(0)
  })

  test('a universe without templates offers no button and New type still works', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Plainworld '),
      description: null,
    })
    const game = await newGame(page, world.id)

    await page.goto(`/app/universes/${world.id}/types?context=gaming&game=${game.id}`)
    await expect(page.getByTestId('project-type-add')).toBeVisible()
    await expect(page.getByTestId('project-type-from-template')).toHaveCount(0)

    const name = unique('Manual ')
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('type-name').fill(name)
    await page.getByTestId('save-type').click()
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
