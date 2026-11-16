import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #231: the sidebar lists every project, with no All projects row, and folds the whole group from its heading.
 * Twelve projects is more than the old bound of eight (#198), so a returning bound would fail here.
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

const projectLinks = (page: Page) =>
  page.getByTestId('sidebar-projects').locator('[data-testid^="project-link-"]')

test.describe('Sidebar project list', () => {
  test('the sidebar lists every project and has no All projects row', async ({ page }) => {
    await signUp(page)
    const { worldId, oldestFirst } = await seed(page)

    await page.goto(`/app/universes/${worldId}`)
    await expect(projectLinks(page)).toHaveCount(SEEDED)
    for (const shown of oldestFirst) {
      await expect(page.getByTestId(`project-link-${shown.id}`)).toBeVisible()
    }
    await expect(page.getByTestId('projects-all')).toHaveCount(0)
  })

  test('the projects group folds from its heading and says so', async ({ page }) => {
    await signUp(page)
    const { worldId } = await seed(page)

    await page.goto(`/app/universes/${worldId}`)
    const toggle = page.getByTestId('projects-group-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
    await expect(projectLinks(page)).toHaveCount(SEEDED)

    // A button, so the keyboard folds it with no key handling of our own.
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(projectLinks(page).first()).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(projectLinks(page)).toHaveCount(SEEDED)
  })
})
