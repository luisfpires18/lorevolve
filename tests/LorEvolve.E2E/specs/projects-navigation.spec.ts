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
/** Every project belongs to a universe (#172), so the helper takes one rather than allowing null. */
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
      'workspace-world-logic',
      'workspace-timeline',
      'workspace-ideas',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible()
    }
    // Chronology is Timeline's configuration view, not a section beside it (#200).
    await expect(page.getByTestId('workspace-chronology')).toHaveCount(0)
    // Stories is no longer a section beside the projects that list the same stories (#191).
    await expect(page.getByTestId('workspace-stories')).toHaveCount(0)

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
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}/overview$`),
    )
    await expect(page.getByTestId('project-name')).toContainText(inWorld.name)

    // The universe's own sections are still in the same navigation, which is the point.
    await expect(page.getByTestId('workspace-lore')).toBeVisible()
    await expect(page.getByTestId('workspace-timeline')).toBeVisible()
    await expect(page.getByTestId('workspace-name')).toContainText(world.name)

    // Being the project that is open, it is already expanded here: the universe's frame is one of the two the
    // sidebar counts, so nothing has to be clicked to reveal its pages.
    await expect(page.getByTestId(`project-toggle-${inWorld.id}`)).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    // And the project's own views stay inside the universe too (#192).
    await page.getByTestId(`project-manuscript-${inWorld.id}`).click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}/manuscript$`),
    )
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

    await page.getByTestId(`project-structure-${shut.id}`).click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${shut.id}/structure$`),
    )
    await expect(page.getByTestId('project-name')).toContainText(shut.name)
  })

  /**
   * Every project belongs to exactly one universe (#172), so the account-level list gathers the projects of every
   * universe the account can reach, offers no filter for projects without one, and cannot make a project there.
   */
  test('the account-level list gathers every universe s projects and makes none of its own', async ({
    page,
  }) => {
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

    // No filter for projects without a universe, because there are none, and nothing here makes one.
    await expect(page.getByTestId('projects-filter-standalone')).toHaveCount(0)
    await expect(page.getByTestId('projects-filter-all')).toHaveCount(0)
    await expect(page.getByTestId('projects-page-new')).toHaveCount(0)

    // Opening the form directly says what it needs rather than offering a save that can only be refused.
    await page.goto('/app/projects/new')
    await expect(page.getByTestId('project-new-needs-universe')).toBeVisible()
    await expect(page.getByTestId('project-new-save')).toHaveCount(0)

    await page.goto('/app/projects')
    await page.getByTestId(`projects-row-${there.id}`).click()
    await expect(page.getByTestId('project-name')).toContainText(there.name)
    await expect(page.getByTestId('project-breadcrumb-universe')).toContainText(second.name)
  })

  test('a project is made from the sidebar, and the list works at phone width', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    await page.setViewportSize({ width: 390, height: 844 })

    // From the universe's own Projects screen, where the universe it belongs to is known (#172).
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

  test('a story an author already has is a Writing Project, and opens its project shell like any other', async ({
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

    // It opens the project shell, whose Structure is the story's own page: nothing of it was copied anywhere (#140),
    // and since #194 it is reached the way every other project is.
    await row.click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${existing.id}/structure`),
    )

    await expect(page.getByTestId('project-tabs')).toBeAttached()
    await expect(page.getByTestId('story-title')).toHaveText(existing.title)

    // And in the universe's own sidebar, a row that expands like every other project's, to the story's three views.
    await page.goto(`/app/universes/${world.id}`)
    const link = page.getByTestId(`project-link-${existing.id}`)
    await expect(link).toContainText(existing.title)
    await page.getByTestId(`project-toggle-${existing.id}`).click()
    const pages = page.getByTestId(`project-pages-${existing.id}`)
    await expect(pages.getByRole('link')).toHaveText(['Structure', 'Manuscript', 'Ideas'])
    await link.click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${existing.id}/structure`),
    )
  })

  test('every address a story had still opens the same screen, under its project', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const existing = await story(page, world.id, unique('The Salt Road '))
    const scene = await api<{ id: string; title: string }>(
      page,
      'POST',
      `/api/universes/${world.id}/stories/${existing.id}/scenes`,
      {
        title: unique('Crossing '),
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
      },
    )
    const old = `/app/universes/${world.id}/stories/${existing.id}`
    const next = `/app/universes/${world.id}/projects/${existing.id}`

    // Each old address, and where it lands: the same view, inside the project shell (#194).
    const cases: Array<[string, string]> = [
      [old, `${next}/structure`],
      [`${old}/plot`, `${next}/structure`],
      [`${old}/ideas`, `${next}/ideas`],
      [`${old}/manuscript/${scene.id}`, `${next}/manuscript/${scene.id}`],
      // The account-level project address names no universe; a story reached there finds its own (#199).
      [`/app/projects/${existing.id}`, `${next}/structure`],
      [`/app/projects/${existing.id}/manuscript/${scene.id}`, `${next}/manuscript/${scene.id}`],
    ]
    for (const [from, to] of cases) {
      await page.goto(from)
      await expect(page).toHaveURL(new RegExp(`${to}$`))
      await expect(page.getByTestId('project-tabs')).toBeAttached()
      await expect(page.getByTestId('story-title')).toHaveText(existing.title)
      await expect(page.getByTestId('project-breadcrumb-universe')).toHaveText(world.name)
      await expect(page.getByTestId('project-breadcrumb-project')).toHaveText(existing.title)
    }
    await page.goto(
      `/app/projects/${existing.id}/manuscript/${scene.id}?from=search#scene-${scene.id}`,
    )
    await expect(page).toHaveURL(
      new RegExp(`${next}/manuscript/${scene.id}\\?from=search#scene-${scene.id}$`),
    )

    // A manuscript link to one scene still opens that scene, and the query and the hash travel with the redirect.
    await page.goto(`${old}/manuscript/${scene.id}?from=search#scene-${scene.id}`)
    await expect(page).toHaveURL(
      new RegExp(`${next}/manuscript/${scene.id}\\?from=search#scene-${scene.id}$`),
    )
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(scene.title)
    await page.goto(`${old}#scene-${scene.id}`)
    await expect(page).toHaveURL(new RegExp(`${next}/structure#scene-${scene.id}$`))

    // The project's own tabs are the story's three views, and the story's page is the one it always was.
    await page.getByTestId('projecttab-manuscript').click()
    await expect(page).toHaveURL(new RegExp(`${next}/manuscript/${scene.id}$`))
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(scene.title)
    await page.getByTestId('projecttab-ideas').click()
    await expect(page.getByTestId('ideas-empty')).toContainText('No ideas for this story yet.')

    // The bare project address, and a view a story does not have, land on the Structure.
    await page.goto(next)
    await expect(page).toHaveURL(new RegExp(`${next}/structure$`))
    await page.goto(`${next}/entities`)
    await expect(page).toHaveURL(new RegExp(`${next}/structure$`))
  })
})
