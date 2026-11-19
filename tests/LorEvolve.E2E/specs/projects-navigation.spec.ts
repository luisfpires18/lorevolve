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

    // Projects is one entry under Management; the sidebar has no per-project rows, toggle or New project (#271).
    const sidebar = page.getByRole('navigation', { name: 'Universe', exact: true })
    await expect(sidebar.getByTestId('sidebar-upkeep').getByRole('link').first()).toHaveText(
      'Projects',
    )
    await expect(sidebar.locator('[data-testid^="project-link-"]')).toHaveCount(0)
    await expect(page.getByTestId('sidebar-projects')).toHaveCount(0)
    await expect(page.getByTestId('projects-new')).toHaveCount(0)
    await expect(page.getByTestId('projects-all')).toHaveCount(0)

    // The project is reached from the Projects directory, through its Writing card.
    await page.getByTestId('workspace-projects').click()
    await page
      .getByTestId('projects-directory-card')
      .and(page.locator('[data-section="writing"]'))
      .click()
    await page
      .getByTestId('writing-project-row')
      .filter({ hasText: first.name })
      .getByRole('link')
      .click()
    await expect(page.getByTestId('project-name')).toContainText(first.name)
  })

  test('opening a project from a universe keeps the author inside that universe', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const inWorld = await project(page, unique('The Deep Survey '), world.id)

    await page.goto(`/app/universes/${world.id}`)

    // The project itself, from the universe's Projects directory and its Writing list.
    await page.getByTestId('workspace-projects').click()
    await page
      .getByTestId('projects-directory-card')
      .and(page.locator('[data-section="writing"]'))
      .click()
    await page
      .getByTestId('writing-project-row')
      .filter({ hasText: inWorld.name })
      .getByRole('link')
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}/structure$`),
    )
    await expect(page.getByTestId('project-name')).toContainText(inWorld.name)

    // The universe's own sections are still in the same navigation, which is the point, and Projects stays current.
    await expect(page.getByTestId('workspace-lore')).toBeVisible()
    await expect(page.getByTestId('workspace-timeline')).toBeVisible()
    await expect(page.getByTestId('workspace-name')).toContainText(world.name)
    await expect(page.getByTestId('workspace-projects')).toHaveAttribute('aria-current', 'page')

    // And the project's own views, from its tab bar, stay inside the universe too (#192).
    await page.getByTestId('projecttab-manuscript').click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${inWorld.id}/manuscript$`),
    )
    await expect(page.getByTestId('workspace-lore')).toBeVisible()
  })

  test('a project has no row in the sidebar, and its views are walked from its tab bar', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const open = await project(page, unique('Winter Light '), world.id)

    await page.goto(`/app/projects/${open.id}`)

    await expect(page.locator('[data-testid^="project-toggle-"]')).toHaveCount(0)
    await expect(page.getByTestId('project-tabs')).toBeVisible()

    await page.getByTestId('projecttab-structure').click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${open.id}/structure$`),
    )
    await expect(page.getByTestId('project-name')).toContainText(open.name)
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
    await expect(page.locator(`[data-project-id="${here.id}"]`)).toContainText(first.name)
    await expect(page.getByTestId(`projects-row-${there.id}`)).toContainText(there.name)
    await expect(page.locator(`[data-project-id="${there.id}"]`)).toContainText(second.name)

    // No filter for projects without a universe, because there are none, and nothing here makes one.
    await expect(page.getByTestId('projects-filter-standalone')).toHaveCount(0)
    await expect(page.getByTestId('projects-filter-all')).toHaveCount(0)
    await expect(page.getByTestId('projects-page-new')).toHaveCount(0)

    // Opening the form directly says what it needs rather than offering a save that can only be refused.
    await page.goto('/app/projects/new')
    await expect(page.getByTestId('project-new-needs-universe')).toBeVisible()
    // Still the screen it was opened as: one h1 says so (#412).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New project')
    await expect(page.getByTestId('project-new-save')).toHaveCount(0)

    await page.goto('/app/projects')
    await page.getByTestId(`projects-row-${there.id}`).click()
    await expect(page.getByTestId('project-name')).toContainText(there.name)
    // No breadcrumb (#377): the workspace names the universe the project opened in.
    await expect(page.getByTestId('workspace-name')).toContainText(second.name)
  })

  test('a project is made from the Projects page, and the list works at phone width', async ({
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

    // A game opens on Entities, headed by its own name and facts.
    await expect(page.getByTestId('project-name')).toHaveText(name)
    await expect(page.getByTestId('project-facts').getByTestId('project-meta')).toContainText(
      'Game',
    )

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
    // The row's link carries the title; its kind sits in the line beneath it.
    await expect(page.locator(`[data-project-id="${existing.id}"]`)).toContainText('Writing')

    // It opens the project shell, whose Structure is the story's own page: nothing of it was copied anywhere (#140),
    // and since #194 it is reached the way every other project is.
    await row.click()
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${existing.id}/structure`),
    )

    await expect(page.getByTestId('story-title')).toHaveText(existing.title)

    // One bar of views, the story's own, carrying its two views; the project draws no second one, and the sidebar
    // has no row for it.
    await expect(page.getByTestId('project-tabs')).toHaveCount(0)
    await expect(page.getByTestId('project-breadcrumb')).toHaveCount(0)
    await expect(page.getByTestId('story-views').getByRole('link')).toHaveText([
      'Structure',
      'Manuscript',
    ])
    // The same chips every project's views are (#377).
    await expect(page.getByTestId('story-view-scenes')).toHaveClass(/lorecatalog__group/)
    await expect(page.getByTestId('story-view-manuscript')).toHaveClass(/lorecatalog__group/)
    await expect(page.locator('[data-testid^="project-link-"]')).toHaveCount(0)
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
      [`${old}/manuscript/${scene.id}`, `${next}/manuscript/${scene.id}`],
      // The account-level project address names no universe; a story reached there finds its own (#199).
      [`/app/projects/${existing.id}`, `${next}/structure`],
      [`/app/projects/${existing.id}/manuscript/${scene.id}`, `${next}/manuscript/${scene.id}`],
    ]
    for (const [from, to] of cases) {
      await page.goto(from)
      await expect(page).toHaveURL(new RegExp(`${to}$`))
      await expect(page.getByTestId('story-title')).toHaveText(existing.title)
      await expect(page.getByTestId('project-tabs')).toHaveCount(0)
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

    // The project's views are the story's two, walked from the story's own bar: the shell draws no second one.
    await page.getByTestId('story-view-manuscript').click()
    await expect(page).toHaveURL(new RegExp(`${next}/manuscript/${scene.id}$`))
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText(scene.title)

    // The bare project address, and a view a story does not have, land on the Structure.
    await page.goto(next)
    await expect(page).toHaveURL(new RegExp(`${next}/structure$`))
    await page.goto(`${next}/entities`)
    await expect(page).toHaveURL(new RegExp(`${next}/structure$`))
  })
})
