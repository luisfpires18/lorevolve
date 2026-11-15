import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #198: the sidebar's project list is bounded. A universe seeded with more projects than the bound draws only the
 * most recently updated ones, still draws the project the author is in when that one is the oldest, leaves the rest to
 * All projects, and folds the whole group from its heading.
 *
 * The bound is `SIDEBAR_PROJECT_LIMIT` in `components/ProjectsNav.tsx`; it is repeated here because a spec should say
 * the number it expects rather than read it from the code under test.
 */

const BOUND = 8
const SEEDED = BOUND + 4
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

test.describe('Sidebar project bound', () => {
  test('the sidebar lists the newest projects, keeps the one being read, and All projects lists every one', async ({
    page,
  }) => {
    await signUp(page)
    const { worldId, oldestFirst } = await seed(page)
    const newest = oldestFirst.slice(-BOUND)
    const oldest = oldestFirst[0]

    await page.goto(`/app/universes/${worldId}`)
    await expect(projectLinks(page)).toHaveCount(BOUND)
    for (const shown of newest) {
      await expect(page.getByTestId(`project-link-${shown.id}`)).toBeVisible()
    }
    await expect(page.getByTestId(`project-link-${oldest.id}`)).toHaveCount(0)

    // The oldest project, past the bound, is still drawn while the author is inside it, and starts expanded.
    await page.goto(`/app/universes/${worldId}/projects/${oldest.id}`)
    await expect(page.getByTestId(`project-link-${oldest.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-toggle-${oldest.id}`)).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(projectLinks(page)).toHaveCount(BOUND + 1)

    // The rest are behind All projects, which lists every one of them.
    await page.getByTestId('projects-all').click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${worldId}/projects$`))
    const list = page.getByTestId('projects-list')
    await expect(list.locator('[data-testid^="projects-row-"]')).toHaveCount(SEEDED)
    for (const each of oldestFirst) {
      await expect(page.getByTestId(`projects-row-${each.id}`)).toBeVisible()
    }
  })

  test('the projects group folds from its heading and says so', async ({ page }) => {
    await signUp(page)
    const { worldId } = await seed(page)

    await page.goto(`/app/universes/${worldId}`)
    const toggle = page.getByTestId('projects-group-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
    await expect(projectLinks(page)).toHaveCount(BOUND)

    // A button, so the keyboard folds it with no key handling of our own.
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(projectLinks(page).first()).toBeHidden()
    await expect(page.getByTestId('projects-all')).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(projectLinks(page)).toHaveCount(BOUND)
  })
})
