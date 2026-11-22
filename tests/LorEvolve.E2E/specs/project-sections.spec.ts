import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #192: a project's own sections. Each kind offers its views as addresses under both project addresses, and as a
 * tab bar in the project's shell, the only place they are walked (#271). These walk a project's views, pin the per-kind lists, and check that an unknown segment lands on the first view.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('projsec')
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

async function universe(page: Page) {
  return api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Sectionworld '),
    description: null,
  })
}

/** Kind travels as a number: 0 Writing, 1 Game, 2 Series, 3 Film, 4 Comic. */
async function project(page: Page, universeId: string, kind: number) {
  return api<{ id: string; name: string }>(page, 'POST', '/api/projects', {
    name: unique('Sectioned '),
    kind,
    lifecycle: 0,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

async function tabSegments(page: Page) {
  await expect(page.getByTestId('project-tabs')).toBeAttached()
  // `a`, not the link role: a hidden bar is out of the accessibility tree, and its links with it.
  const links = page.getByTestId('project-tabs').locator('a')
  const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
  return hrefs.map((href) => href?.split('/').pop())
}

test.describe('Project sections', () => {
  test('a game project walks its views from the tab bar', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const game = await project(page, world.id, 1)
    const base = `/app/universes/${world.id}/projects/${game.id}`

    // The bare address leads to the kind's first view. A game has no overview: it opens on Entities, its facts under
    // the tabs.
    await page.goto(base)
    await expect(page).toHaveURL(new RegExp(`${base}/entities$`))
    // A game heads its own page: its name and facts over its views as chips, with no breadcrumb (owner, 2026-11-17).
    await expect(page.getByTestId('project-facts')).toBeVisible()
    await expect(page.getByTestId('project-name')).toBeVisible()
    await expect(page.getByTestId('project-breadcrumb')).toHaveCount(0)

    // The tab bar lists the kind's views, in order, and the sidebar lists none of them.
    const expected = ['entities', 'types', 'systems']
    expect(await tabSegments(page)).toEqual(expected)
    await expect(page.locator('[data-testid^="project-pages-"]')).toHaveCount(0)

    // The tab bar is a visible navigation landmark of links at every width, and walks each view inside the universe's frame.
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await expect(page.getByRole('navigation', { name: 'Project views' })).toBeVisible()
      for (const segment of [...expected].reverse()) {
        await page.getByTestId(`projecttab-${segment}`).click()
        await expect(page).toHaveURL(new RegExp(`${base}/${segment}$`))
        await expect(page.getByTestId(`projecttab-${segment}`)).toHaveAttribute(
          'aria-current',
          'page',
        )
        await expect(page.getByTestId('workspace-lore')).toBeAttached()
      }
    }

    // Each view renders one panel and never another's (#193). A project with no types opens Entities on the starter
    // offer, and the type editor is its own tab (#196).
    await page.getByTestId('projecttab-entities').click()
    await expect(page.getByTestId('project-schema-offer')).toBeVisible()
    await expect(page.getByTestId('project-entries')).toHaveCount(0)
    // The project's name is the screen's one h1; the panel heads under it are h2 (#412).
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await page.getByTestId('projecttab-types').click()
    await expect(page.getByTestId('project-schema')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    // Headed as the universe Types page's Gaming view is: its title, and a lede naming this game.
    await expect(page.getByTestId('project-types-title')).toHaveText('Types')
    await expect(page.getByTestId('project-schema')).toContainText(
      `Types of ${game.name}. They belong to this game only.`,
    )
    await expect(page.getByTestId('project-entries')).toHaveCount(0)
    await page.getByTestId('projecttab-systems').click()
    await expect(page.getByTestId('project-view-empty-systems')).toBeVisible()
    await expect(page.getByTestId('project-schema')).toHaveCount(0)
  })

  test('a type made in the type editor is in the entries the moment its card opens', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const game = await project(page, world.id, 1)
    const base = `/app/universes/${world.id}/projects/${game.id}/entities`
    const unit = await page.request.post(`/api/projects/${game.id}/entity-types`, {
      data: { name: 'Unit', description: null, icon: null, accentColor: null },
    })
    expect(unit.ok()).toBe(true)

    await page.goto(base)
    const cards = page.getByTestId('project-entity-type-cards')
    await expect(cards.getByTestId('lore-type-card')).toHaveCount(1)
    // A marker on the window: a reload anywhere below would drop it.
    await page.evaluate(() => Object.assign(window, { noReload: true }))

    // The write happens in the editor behind the action, then the author moves by links, without a reload.
    await page.getByTestId('projecttab-types').click()
    // The same drawer the universe's Types screen opens.
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('type-name').fill('Encounter')
    await page.getByTestId('save-type').click()
    await expect(page.getByTestId('project-types')).toContainText('Encounter')
    await page.getByTestId('projecttab-entities').click()

    await expect(cards.getByTestId('lore-type-card')).toHaveCount(2)
    await cards.getByRole('link', { name: /Encounter/ }).click()
    await expect(page.getByTestId('project-entries')).toBeVisible()
    await expect(page.getByTestId('project-entries-needs-type')).toHaveCount(0)
    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Ambush')
    await page.getByTestId('project-entry-new-save').click()
    await expect(page.getByTestId('project-entry-list')).toContainText('Ambush')

    expect(await page.evaluate(() => (window as unknown as { noReload?: boolean }).noReload)).toBe(
      true,
    )
  })

  test('only Series, Film and Comic draw a structure panel, on Structure alone', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    for (const kind of [2, 3, 4]) {
      const one = await project(page, world.id, kind)
      await page.goto(`/app/projects/${one.id}/structure`)
      await expect(page.getByTestId('project-seasons')).toBeVisible()
      await expect(page.getByTestId('project-schema')).toHaveCount(0)
      await expect(page.getByTestId('project-entries')).toHaveCount(0)
      for (const segment of ['script', 'entities']) {
        await page.getByTestId(`projecttab-${segment}`).click()
        await expect(page).toHaveURL(new RegExp(`/${segment}$`))
        await expect(page.getByTestId('project-seasons')).toHaveCount(0)
      }
    }
    const book = await project(page, world.id, 0)
    await page.goto(`/app/projects/${book.id}/structure`)
    await expect(page.getByTestId('project-view-empty-structure')).toBeVisible()
    await expect(page.getByTestId('project-seasons')).toHaveCount(0)
  })

  test('each kind offers its own views, at both project addresses', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const cases: Array<[number, string[]]> = [
      [0, ['structure', 'manuscript', 'entities', 'types', 'systems']],
      [2, ['structure', 'script', 'entities', 'types', 'systems']],
      [3, ['structure', 'script', 'entities', 'types', 'systems']],
      [4, ['structure', 'script', 'entities', 'types', 'systems']],
    ]

    for (const [kind, expected] of cases) {
      const one = await project(page, world.id, kind)
      await page.goto(`/app/projects/${one.id}`)
      // The account-level address redirects to the canonical one, inside the project's universe (#199).
      await expect(page).toHaveURL(
        new RegExp(`/app/universes/${world.id}/projects/${one.id}/${expected[0]}$`),
      )
      expect(await tabSegments(page)).toEqual(expected)
      // One head for every kind (#377): the project's facts, no breadcrumb and no overview.
      await expect(page.getByTestId('project-facts')).toBeVisible()
      await expect(page.getByTestId('project-breadcrumb')).toHaveCount(0)
      await expect(page.getByTestId('projecttab-overview')).toHaveCount(0)

      // The universe-scoped twin serves the same view.
      await page.goto(`/app/universes/${world.id}/projects/${one.id}/${expected[1]}`)
      await expect(page.getByTestId('project-name')).toContainText(one.name)
      await expect(page.getByTestId(`projecttab-${expected[1]}`)).toHaveAttribute(
        'aria-current',
        'page',
      )
    }

    // The script view keeps the app's own word for what an episode, a scene and a chapter carry.
    const film = await project(page, world.id, 3)
    await page.goto(`/app/projects/${film.id}/script`)
    await expect(page.getByTestId('projecttab-script')).toHaveText('Script')
  })

  test('an unknown segment lands on the first view, at both addresses', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const book = await project(page, world.id, 0)

    await page.goto(`/app/projects/${book.id}/no-such-view`)
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${book.id}/structure$`),
    )
    await expect(page.getByTestId('project-name')).toContainText(book.name)

    // A view another kind offers is unknown to this one.
    await page.goto(`/app/universes/${world.id}/projects/${book.id}/script`)
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${book.id}/structure$`),
    )
  })

  test('every kind opens the same head and chips', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const cases: Array<[number, string[]]> = [
      [0, ['structure', 'manuscript', 'entities', 'types', 'systems']],
      [1, ['entities', 'types', 'systems']],
      [2, ['structure', 'script', 'entities', 'types', 'systems']],
      [3, ['structure', 'script', 'entities', 'types', 'systems']],
      [4, ['structure', 'script', 'entities', 'types', 'systems']],
    ]
    await page.setViewportSize({ width: 375, height: 740 })

    for (const [kind, expected] of cases) {
      const one = await project(page, world.id, kind)
      const base = `/app/universes/${world.id}/projects/${one.id}`
      // The retired Overview lands on the kind's first view, keeping the query and the hash.
      await page.goto(`${base}/overview?probe=1#top`)
      await expect(page).toHaveURL(new RegExp(`${base}/${expected[0]}\\?probe=1#top$`))

      await expect(page.getByTestId('project-facts')).toBeVisible()
      await expect(page.getByTestId('project-name')).toHaveText(one.name)
      await expect(page.getByTestId('project-breadcrumb')).toHaveCount(0)
      await expect(page.getByTestId('projecttab-overview')).toHaveCount(0)
      expect(await tabSegments(page)).toEqual(expected)
      await expect(page.getByTestId(`projecttab-${expected[0]}`)).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      )
    }
  })

  test('an old overview address redirects for every kind', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const film = await project(page, world.id, 3)
    const comic = await project(page, world.id, 4)
    const game = await project(page, world.id, 1)
    const series = await project(page, world.id, 2)
    const story = await api<{ id: string }>(page, 'POST', `/api/universes/${world.id}/stories`, {
      title: unique('Told '),
      premise: null,
      status: 0,
    })
    const at = (id: string) => `/app/universes/${world.id}/projects/${id}`

    for (const [id, first] of [
      [film.id, 'structure'],
      [comic.id, 'structure'],
      [game.id, 'entities'],
    ]) {
      await page.goto(`${at(id)}/overview`)
      await expect(page).toHaveURL(new RegExp(`${at(id)}/${first}$`))
      await expect(page.getByTestId(`projecttab-${first}`)).toHaveAttribute('aria-current', 'page')
    }

    // A story-backed project has the story's own chips.
    await page.goto(`${at(story.id)}/overview`)
    await expect(page).toHaveURL(new RegExp(`${at(story.id)}/structure$`))
    await expect(page.getByTestId('story-view-scenes')).toHaveAttribute('aria-current', 'page')

    // The account-level address keeps the query and the hash too.
    await page.goto(`/app/projects/${series.id}/overview?x=1#h`)
    await expect(page).toHaveURL(new RegExp(`${at(series.id)}/structure\\?x=1#h$`))
    await expect(page.getByTestId('projecttab-structure')).toHaveAttribute('aria-current', 'page')
  })

  test('every project address resolves to one canonical address, under a breadcrumb', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const other = await universe(page)
    const game = await project(page, world.id, 1)
    const canonical = `/app/universes/${world.id}/projects/${game.id}/entities`

    // The account-level address, a deep link included, redirects and keeps the query and the hash (#199).
    await page.goto(`/app/projects/${game.id}/entities?probe=1#top`)
    await expect(page).toHaveURL(new RegExp(`${canonical}\\?probe=1#top$`))

    // For a game the old Manage types address is its Types tab, keeping the rest of its query and its hash.
    const types = canonical.replace(/entities$/, 'types')
    await page.goto(`/app/projects/${game.id}/entities?manage=types`)
    await expect(page).toHaveURL(new RegExp(`${types}$`))
    await page.goto(`/app/projects/${game.id}/entities?manage=types&probe=1#top`)
    await expect(page).toHaveURL(new RegExp(`${types}\\?probe=1#top$`))

    // A universe the project does not belong to lands on the one it does.
    await page.goto(`/app/universes/${other.id}/projects/${game.id}/entities`)
    await expect(page).toHaveURL(new RegExp(`${canonical}$`))

    // A game is headed by its own name rather than a breadcrumb; the sidebar is the way back to the universe.
    await expect(page.getByTestId('project-name')).toHaveText(game.name)
    await expect(page.getByTestId('project-breadcrumb')).toHaveCount(0)
  })

  test('on a narrow screen the tab bar is still the only copy of the views', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const world = await universe(page)
    const game = await project(page, world.id, 1)

    for (const address of [
      `/app/projects/${game.id}/entities`,
      `/app/universes/${world.id}/projects/${game.id}/entities`,
    ]) {
      await page.goto(address)
      await expect(page.getByTestId('project-tabs')).toBeVisible()
      await expect(page.getByTestId(`project-pages-${game.id}`)).toHaveCount(0)

      // Opening the universe's section list on a phone still shows no second copy of the views.
      const toggle = page.getByTestId('workspace-nav-toggle')
      if (await toggle.isVisible()) {
        await toggle.click()
        await expect(page.getByTestId('workspace-projects')).toBeVisible()
        await expect(page.getByTestId(`project-link-${game.id}`)).toHaveCount(0)
      }
    }
  })
})
