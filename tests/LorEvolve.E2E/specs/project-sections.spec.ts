import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #192: a project's own sections. Each kind offers its views as addresses under both project addresses, as rows
 * under the project's sidebar expansion, and as a tab bar in the project's shell. These walk a project's views both
 * ways, pin the per-kind lists, and check that an unknown segment lands on the first view.
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

// The sidebar reads its projects on its own, so wait for the expansion before reading what it lists.
async function sidebarSegments(page: Page, projectId: string) {
  await expect(page.getByTestId(`project-pages-${projectId}`)).toBeVisible()
  const links = page.getByTestId(`project-pages-${projectId}`).getByRole('link')
  const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
  return hrefs.map((href) => href?.split('/').pop())
}

async function tabSegments(page: Page) {
  await expect(page.getByTestId('project-tabs')).toBeVisible()
  const links = page.getByTestId('project-tabs').getByRole('link')
  const hrefs = await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
  return hrefs.map((href) => href?.split('/').pop())
}

test.describe('Project sections', () => {
  test('a game project walks its views from the sidebar and from the tab bar', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const game = await project(page, world.id, 1)
    const base = `/app/universes/${world.id}/projects/${game.id}`

    // The bare address leads to the kind's first view.
    await page.goto(base)
    await expect(page).toHaveURL(new RegExp(`${base}/overview$`))
    await expect(page.getByTestId('project-name')).toContainText(game.name)

    // The sidebar expansion and the tab bar list exactly the same views, in order.
    const expected = ['overview', 'entities', 'systems', 'ideas']
    expect(await sidebarSegments(page, game.id)).toEqual(expected)
    expect(await tabSegments(page)).toEqual(expected)

    // Each view is reachable from the sidebar, inside the universe's frame.
    for (const segment of expected) {
      await page.getByTestId(`project-${segment}-${game.id}`).click()
      await expect(page).toHaveURL(new RegExp(`${base}/${segment}$`))
      await expect(page.getByTestId(`projecttab-${segment}`)).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(page.getByTestId('workspace-lore')).toBeVisible()
    }

    // And from the tab bar, which is a navigation landmark of links.
    await expect(page.getByRole('navigation', { name: 'Project views' })).toBeVisible()
    for (const segment of [...expected].reverse()) {
      await page.getByTestId(`projecttab-${segment}`).click()
      await expect(page).toHaveURL(new RegExp(`${base}/${segment}$`))
    }

    // Ideas has nothing to show yet, and says so rather than failing.
    await page.getByTestId('projecttab-ideas').click()
    await expect(page.getByTestId('project-view-empty-ideas')).toBeVisible()

    // Every other view still renders today's overview panels.
    await page.getByTestId('projecttab-entities').click()
    await expect(page.getByTestId('project-page')).toBeVisible()
    await expect(page.getByTestId('project-view-empty-ideas')).toHaveCount(0)
  })

  test('each kind offers its own views, at both project addresses', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const cases: Array<[number, string[]]> = [
      [0, ['structure', 'manuscript', 'ideas']],
      [2, ['structure', 'script', 'entities', 'ideas']],
      [3, ['structure', 'script', 'entities', 'ideas']],
      [4, ['structure', 'script', 'entities', 'ideas']],
    ]

    for (const [kind, expected] of cases) {
      const one = await project(page, world.id, kind)
      await page.goto(`/app/projects/${one.id}`)
      await expect(page).toHaveURL(new RegExp(`/app/projects/${one.id}/${expected[0]}$`))
      expect(await tabSegments(page)).toEqual(expected)
      expect(await sidebarSegments(page, one.id)).toEqual(expected)

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
    await expect(page).toHaveURL(new RegExp(`/app/projects/${book.id}/structure$`))
    await expect(page.getByTestId('project-name')).toContainText(book.name)

    // A view another kind offers is unknown to this one.
    await page.goto(`/app/universes/${world.id}/projects/${book.id}/systems`)
    await expect(page).toHaveURL(
      new RegExp(`/app/universes/${world.id}/projects/${book.id}/structure$`),
    )
  })

  test('on a narrow screen the tab bar stands in for the sidebar expansion', async ({ page }) => {
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
      await expect(page.getByTestId(`project-pages-${game.id}`)).toBeHidden()

      // Opening the universe's section list on a phone still shows no second copy of the views.
      const toggle = page.getByTestId('workspace-nav-toggle')
      if (await toggle.isVisible()) {
        await toggle.click()
        await expect(page.getByTestId(`project-link-${game.id}`)).toBeVisible()
        await expect(page.getByTestId(`project-pages-${game.id}`)).toBeHidden()
      }
    }
  })
})
