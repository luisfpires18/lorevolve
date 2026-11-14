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
/** Every project belongs to a universe (#171), so the helper takes one rather than allowing null. */
async function project(page: Page, name: string, universeId: string) {
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

async function story(page: Page, universeId: string, title: string) {
  return api<{ id: string; title: string }>(page, 'POST', `/api/universes/${universeId}/stories`, {
    title,
    premise: null,
    status: 0,
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

  test('opening a project from a universe keeps the author inside that universe', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const inWorld = await project(page, unique('The Deep Survey '), world.id)

    await page.goto(`/app/universes/${world.id}`)

    // The project itself, from the universe's own sidebar.
    await page.getByTestId(`project-link-${inWorld.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}$`))
    await expect(page.getByTestId('project-name')).toContainText(inWorld.name)

    // The universe's own sections are still in the same navigation, which is the point.
    await expect(page.getByTestId('workspace-lore')).toBeVisible()
    await expect(page.getByTestId('workspace-stories')).toBeVisible()
    await expect(page.getByTestId('workspace-name')).toContainText(world.name)

    // Being the project that is open, it is already expanded here: the universe's frame is one of the two the
    // sidebar counts, so nothing has to be clicked to reveal its pages.
    await expect(page.getByTestId(`project-toggle-${inWorld.id}`)).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    // And the project's Overview entry stays inside the universe too.
    await page.getByTestId(`project-overview-${inWorld.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}$`))
    await expect(page.getByTestId('workspace-lore')).toBeVisible()
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

  /**
   * Every project belongs to exactly one universe (#171), so the account-level list is every universe's projects
   * gathered in one place rather than a list with some projects outside the worlds. What that screen stops offering is
   * #172's work; this pins down what it gathers.
   */
  test('the account-level list gathers the projects of every universe', async ({ page }) => {
    await signUp(page)
    const first = await universe(page)
    const second = await universe(page)
    const here = await project(page, unique('In the first world '), first.id)
    const there = await project(page, unique('In the second world '), second.id)

    await page.goto('/app')
    await page.getByTestId('workspacebar-projects').click()
    await expect(page).toHaveURL('/app/projects')

    // Both universes' projects, each naming the universe it belongs to.
    await expect(page.getByTestId(`projects-row-${here.id}`)).toContainText(here.name)
    await expect(page.getByTestId(`projects-row-${here.id}`)).toContainText(first.name)
    await expect(page.getByTestId(`projects-row-${there.id}`)).toContainText(there.name)
    await expect(page.getByTestId(`projects-row-${there.id}`)).toContainText(second.name)

    await page.getByTestId(`projects-row-${there.id}`).click()
    await expect(page.getByTestId('project-name')).toContainText(there.name)
    await expect(page.getByTestId('project-universe')).toContainText(second.name)
  })

  test('a project is made from the sidebar, and the list works at phone width', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    await page.setViewportSize({ width: 390, height: 844 })

    // From the universe's own Projects screen, which is where a project is made: it belongs to that universe (#171).
    await page.goto(`/app/universes/${world.id}/projects`)
    await page.getByTestId('projects-page-new').click()
    await expect(page).toHaveURL(new RegExp(`/app/projects/new\\?universeId=${world.id}$`))

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

  test('a story an author already has is a Writing Project, and leads to the story', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const existing = await story(page, world.id, unique('The Glass Harvest '))

    // In the account-level list, beside projects that are projects of their own.
    await page.goto('/app/projects')
    const row = page.getByTestId(`projects-row-${existing.id}`)
    await expect(row).toContainText(existing.title)
    await expect(row).toContainText('Writing')

    // It leads to the story, at the address the story has always had: nothing of it was copied anywhere (#140).
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${world.id}/stories/${existing.id}`))

    // And in the universe's own sidebar, as one link rather than a group of its own.
    await page.goto(`/app/universes/${world.id}`)
    const link = page.getByTestId(`project-link-${existing.id}`)
    await expect(link).toContainText(existing.title)
    await expect(page.getByTestId(`project-toggle-${existing.id}`)).toHaveCount(0)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/app/universes/${world.id}/stories/${existing.id}`))
  })
})
