import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #289: Cinema Sagas and Phases. Two sagas with phases hold a Film and a Series in an order that survives a
 * reload; removing a production leaves the project, and a production row opens the original project.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('saga')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function project(page: Page, universeId: string, name: string, kind: number) {
  const response = await page.request.post('/api/projects', {
    data: { name, kind, lifecycle: 0, subtype: null, summary: null, universeId, format: null },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function group(page: Page, name: string) {
  await page.getByTestId('saga-drawer-name').fill(name)
  await page.getByTestId('saga-drawer-save').click()
  await expect(page.getByTestId('saga-drawer')).toHaveCount(0)
}

async function addTo(page: Page, projectId: string, phaseLabel: string) {
  await page.getByTestId(`unassigned-add-${projectId}`).click()
  await page.getByTestId('saga-add-phase').selectOption({ label: phaseLabel })
  await page.getByTestId('saga-add-save').click()
  await expect(page.getByTestId('saga-add-drawer')).toHaveCount(0)
}

test('sagas hold phases of films and series in an order that persists, and a row opens the project', async ({
  page,
}) => {
  await signUp(page)
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Sagaworld '), description: null },
  })
  const world = (await response.json()) as { id: string }
  const film = await project(page, world.id, 'Saga film', 3)
  const series = await project(page, world.id, 'Saga series', 2)

  await page.goto(`/app/universes/${world.id}/cinema`)
  await page.getByTestId('cinema-view-sagas').click()
  await expect(page.getByTestId('sagas-empty')).toBeVisible()

  await page.getByTestId('saga-new').click()
  await group(page, 'First saga')
  await page.getByTestId('saga-new').click()
  await group(page, 'Second saga')

  const first = page
    .getByTestId('cinema-sagas')
    .locator('section')
    .filter({ hasText: 'First saga' })
  await first.locator('[data-testid^="saga-actions-"]').click()
  await page.locator('[data-testid^="saga-phase-new-"]:visible').click()
  await group(page, 'Opening phase')

  await addTo(page, film, 'First saga / Opening phase')
  await addTo(page, series, 'First saga / Opening phase')

  const members = page.locator('[data-testid^="phase-members-"]')
  await expect(members.locator('li')).toHaveText([/Saga film/, /Saga series/])

  await page.getByTestId(`member-actions-${series}`).click()
  await page.getByTestId(`member-${series}-up`).click()
  await page.reload()
  await expect(members.locator('li')).toHaveText([/Saga series/, /Saga film/])

  await page.getByTestId(`member-actions-${film}`).click()
  await page.getByTestId(`member-remove-${film}`).click()
  await expect(page.getByTestId(`unassigned-${film}`)).toBeVisible()

  await page.getByTestId(`saga-production-${series}`).click()
  await expect(page).toHaveURL(new RegExp(series))
  await expect(page.getByTestId('project-name')).toContainText('Saga series')
})
