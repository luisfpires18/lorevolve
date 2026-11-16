import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #271: the sidebar carries no per-project rows however many projects there are. Projects is one entry under
 * Management, and the Projects page lists every project. Twelve projects is more than the old bound of eight (#198).
 */

const SEEDED = 12
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('projbound')
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

/**
 * Seeds the universe with projects one after another, so each is updated after the one before it and the first is
 * the oldest. Kind and lifecycle travel as numbers: 1 is Game and 0 is Planning.
 */
async function seed(page: Page) {
  const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Boundworld '),
    description: null,
  })
  const projects: { id: string; name: string }[] = []
  for (let index = 0; index < SEEDED; index++) {
    projects.push(
      await api<{ id: string; name: string }>(page, 'POST', '/api/projects', {
        name: `Project ${String(index).padStart(2, '0')}`,
        kind: 1,
        lifecycle: 0,
        subtype: null,
        summary: '',
        universeId: world.id,
        expectedVersion: null,
      }),
    )
  }
  return { worldId: world.id, oldestFirst: projects }
}

test.describe('Sidebar and many projects', () => {
  test('the sidebar has no project rows, and Projects lists them all', async ({ page }) => {
    await signUp(page)
    const { worldId, oldestFirst } = await seed(page)

    await page.goto(`/app/universes/${worldId}`)
    const sidebar = page.getByRole('navigation', { name: 'Universe', exact: true })
    await expect(sidebar.getByTestId('sidebar-upkeep').getByRole('link').first()).toHaveText(
      'Projects',
    )
    await expect(sidebar.locator('[data-testid^="project-link-"]')).toHaveCount(0)
    await expect(sidebar.locator('[data-testid^="project-toggle-"]')).toHaveCount(0)
    await expect(page.getByTestId('projects-group-toggle')).toHaveCount(0)
    await expect(page.getByTestId('projects-all')).toHaveCount(0)

    await sidebar.getByTestId('workspace-projects').click()
    await expect(page).toHaveURL(`/app/universes/${worldId}/projects`)
    await expect(sidebar.getByTestId('workspace-projects')).toHaveAttribute('aria-current', 'page')
    // The directory holds the four families; the seeded Game projects are listed under Gaming.
    await page
      .getByTestId('projects-directory-card')
      .and(page.locator('[data-section="gaming"]'))
      .click()
    for (const shown of oldestFirst) {
      await expect(page.getByTestId(`projects-row-${shown.id}`)).toBeVisible()
    }
  })
})
