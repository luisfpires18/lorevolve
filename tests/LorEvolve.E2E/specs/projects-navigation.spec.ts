import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #139: Projects navigation. A project is what an author is making, and it may belong to a universe or to none.
 * These pin down that the universe's own sections are still all there beside the new group, that one project expands
 * while the others stay shut, that the group is usable from the keyboard, and that a project with no universe is
 * reachable without opening a world at all.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('projnav')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

async function universe(page: Page, name = unique('Projectworld ')) {
  return api<{ id: string; name: string }>(page, 'POST', '/api/universes', {
    name,
    description: null,
  })
}

/** Kind and lifecycle travel as numbers: 0 is Writing and 0 is Planning. */
async function project(page: Page, name: string, universeId: string | null) {
  return api<{ id: string; name: string }>(page, 'POST', '/api/projects', {
    name,
    kind: 0,
    lifecycle: 0,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

test.describe('Projects navigation', () => {
  test('a universe keeps every section it had, and gains its projects beside them', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const first = await project(page, unique('The Salt Road '), world.id)

    await page.goto(`/app/universes/${world.id}`)

    // The worldbuilding sections are still reachable in the same navigation, which is the regression this guards.
    for (const testId of [
      'workspace-overview',
      'workspace-lore',
      'workspace-types',
      'workspace-family-tree',
      'workspace-maps',
      'workspace-world-rules',
      'workspace-chronology',
      'workspace-stories',
      'workspace-timeline',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible()
    }

    await expect(page.getByTestId('sidebar-projects')).toBeVisible()
    await expect(page.getByTestId('projects-all')).toBeVisible()
    await expect(page.getByTestId('projects-new')).toBeVisible()
    await expect(page.getByTestId(`project-link-${first.id}`)).toContainText(first.name)

    // All projects, inside the universe, lists that universe's projects.
    await page.getByTestId('projects-all').click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${world.id}/projects$`))
    await expect(page.getByTestId(`projects-row-${first.id}`)).toContainText(first.name)
  })

  test('only the project being read is expanded, and the others open on request', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const open = await project(page, unique('Winter Light '), world.id)
    const shut = await project(page, unique('Hollow Season '), world.id)

    await page.goto(`/app/projects/${open.id}`)

    const openToggle = page.getByTestId(`project-toggle-${open.id}`)
    const shutToggle = page.getByTestId(`project-toggle-${shut.id}`)

    await expect(openToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(shutToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId(`project-pages-${open.id}`)).toBeVisible()
    await expect(page.getByTestId(`project-pages-${shut.id}`)).toHaveCount(0)

    // The disclosure is a button, so a keyboard opens it with no key handling of our own.
    await shutToggle.focus()
    await page.keyboard.press('Enter')
    await expect(shutToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId(`project-pages-${shut.id}`)).toBeVisible()

    // What was opened by hand stays open; the one being read can be closed by hand.
    await openToggle.click()
    await expect(openToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(shutToggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId(`project-overview-${shut.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/app/projects/${shut.id}$`))
    await expect(page.getByTestId('project-name')).toContainText(shut.name)
  })

  test('a project with no universe is reachable without opening a world', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const inWorld = await project(page, unique('In a world '), world.id)
    const alone = await project(page, unique('On its own '), null)

    await page.goto('/app')
    await page.getByTestId('workspacebar-projects').click()
    await expect(page).toHaveURL('/app/projects')

    // Everything the account can reach, both kinds.
    await expect(page.getByTestId(`projects-row-${alone.id}`)).toContainText(alone.name)
    await expect(page.getByTestId(`projects-row-${inWorld.id}`)).toContainText(inWorld.name)

    // Then only the ones belonging to no universe.
    await page.getByTestId('projects-filter-standalone').click()
    await expect(page.getByTestId(`projects-row-${alone.id}`)).toBeVisible()
    await expect(page.getByTestId(`projects-row-${inWorld.id}`)).toHaveCount(0)

    await page.getByTestId(`projects-row-${alone.id}`).click()
    await expect(page.getByTestId('project-name')).toContainText(alone.name)
    await expect(page.getByTestId('project-universe')).toContainText('No universe')
  })

  test('a project is made from the sidebar, and the list works at phone width', async ({
    page,
  }) => {
    await signUp(page)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/app/projects')
    await page.getByTestId('projects-page-new').click()
    await expect(page).toHaveURL('/app/projects/new')

    const name = unique('The Tide Engine ')
    await page.getByTestId('project-new-name').fill(name)
    await page.getByTestId('project-new-kind').selectOption('1')
    await page.getByTestId('project-new-save').click()

    await expect(page.getByTestId('project-name')).toContainText(name)
    await expect(page.getByTestId('project-meta')).toContainText('Game')

    // Nothing in the list pushes the phone's viewport sideways.
    await page.goto('/app/projects')
    await expect(page.getByTestId('projects-list')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
