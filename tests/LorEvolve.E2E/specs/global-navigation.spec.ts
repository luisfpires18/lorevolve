import { expect, test, type Page } from '@playwright/test'
import { openAccountMenu } from './support/account'

/**
 * Product refinement 024: global navigation and wayfinding. LorEvolve has two sides - Explore, the public one, and My
 * workspace, the signed-in one - and the workspace has its account-level places (Universes, Ideas, and Profile from the
 * account menu) and, one level deeper, a universe with its own sections. These pin down that every screen says which of
 * those it is, in the same words, with one way up and one way out, to a keyboard and a screen reader as well as to
 * the eye.
 */

const PASSWORD = 'Test-password-123!'
const BRAND = 'LorEvolve – Home'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page, email?: string) {
  const username = unique('wayfinder')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email ?? `${username}@example.test`)
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

/** A universe with one entry and one story, so its deep screens exist. */
async function world(page: Page, name = unique('Hollowmere ')) {
  const { id } = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: null,
  })
  const types = await api<{ id: string }[]>(page, 'GET', `/api/universes/${id}/entity-types`)
  const entry = await api<{ id: string }>(page, 'POST', `/api/universes/${id}/entities`, {
    entityTypeId: types[0]!.id,
    name: 'Ione Marsh',
    summary: 'Keeper of the count.',
    canonStatus: 1,
    aliases: [],
    tags: [],
    fields: [],
  })
  const story = await api<{ id: string }>(page, 'POST', `/api/universes/${id}/stories`, {
    title: 'The Long Count',
    summary: null,
  })
  return { id, name, entryId: entry.id, storyId: story.id }
}

const workspaceNav = (page: Page) => page.getByRole('navigation', { name: 'My workspace' })
const tab = (page: Page, name: 'Universes' | 'Ideas') =>
  workspaceNav(page).getByRole('link', { name, exact: true })
const main = (page: Page) => page.locator('main')
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

test.describe('My workspace: one frame for the account-level screens', () => {
  test('Universes, Ideas, an idea and Profile wear the same bar, with the right place current', async ({
    page,
  }) => {
    await signUp(page)
    const { id: ideaId } = await api<{ id: string }>(page, 'POST', '/api/ideas', {
      title: 'Tides that run uphill',
      body: '',
      universeId: null,
      references: [],
      expectedUpdatedAt: null,
    })

    const screens: { path: string; heading: string; current: 'Universes' | 'Ideas' | null }[] = [
      { path: '/app', heading: 'Universes', current: 'Universes' },
      { path: '/app/ideas', heading: 'Ideas', current: 'Ideas' },
      { path: '/app/ideas/new', heading: 'New idea', current: 'Ideas' },
      { path: `/app/ideas/${ideaId}`, heading: 'Tides that run uphill', current: 'Ideas' },
      { path: '/app/profile', heading: 'Profile', current: null },
    ]

    for (const screen of screens) {
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(screen.heading)

      // Exactly one bar and one workspace landmark: nothing per screen beside it.
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(workspaceNav(page)).toHaveCount(1)
      await expect(page.getByText('My workspace', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: BRAND })).toHaveAttribute('href', '/')
      await expect(page.getByTestId('home-explore')).toHaveText('Explore')
      await expect(page.getByTestId('account-menu-trigger')).toBeVisible()

      // The place that is open is the current page, by its semantics, and only that one. Profile is neither.
      for (const name of ['Universes', 'Ideas'] as const) {
        if (name === screen.current) {
          await expect(tab(page, name)).toHaveAttribute('aria-current', 'page')
        } else {
          await expect(tab(page, name)).not.toHaveAttribute('aria-current', 'page')
        }
      }

      // The old per-screen header's way back is gone; the bar's places replace it.
      await expect(page.getByRole('link', { name: 'All universes' })).toHaveCount(0)
      await expect(page.getByText('Explore worlds')).toHaveCount(0)
    }

    // The tabs go where they say, and the current mark moves with them.
    await page.goto('/app')
    await tab(page, 'Ideas').click()
    await expect(page).toHaveURL('/app/ideas')
    await expect(tab(page, 'Ideas')).toHaveAttribute('aria-current', 'page')
    await tab(page, 'Universes').click()
    await expect(page).toHaveURL('/app')
    await expect(tab(page, 'Universes')).toHaveAttribute('aria-current', 'page')
  })

  test('the tab names the screen, and changes as the screen does', async ({ page }) => {
    await signUp(page)
    await expect(page).toHaveTitle('Universes | LorEvolve')
    await tab(page, 'Ideas').click()
    await expect(page).toHaveTitle('Ideas | LorEvolve')
    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveTitle('Profile | LorEvolve')
  })
})

test.describe('Explore: the public side, called one thing', () => {
  test('the portal names Explore, keeps My workspace prominent, and points no arrow outward', async ({
    page,
  }) => {
    await signUp(page)
    await page.goto('/explore')

    await expect(
      page.getByRole('navigation', { name: 'Explore' }).getByRole('link', { name: 'Explore' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Portal' })).toHaveCount(0)
    await expect(page.getByText('Explore worlds')).toHaveCount(0)

    const workspace = page.getByTestId('portal-workspace')
    await expect(workspace).toHaveText('My workspace')
    // A same-tab link across, not one that looks as if it opened another site.
    await expect(workspace.locator('svg')).toHaveCount(0)

    await workspace.click()
    await expect(page).toHaveURL('/app')
    await expect(page.getByTestId('home-explore').locator('svg')).toHaveCount(0)
  })
})

test.describe('The brand leads to LorEvolve’s home from every shell, and says so (031)', () => {
  test('portal, Universes, Profile and a universe', async ({ page }) => {
    await signUp(page)
    const w = await world(page)

    for (const path of ['/explore', '/app', '/app/profile']) {
      await page.goto(path)
      const brand = page.getByRole('link', { name: BRAND })
      await expect(brand).toHaveCount(1)
      await brand.click()
      await expect(page).toHaveURL('/')
      await expect(page.getByTestId('landing')).toBeVisible()
    }

    await page.goto(`/app/universes/${w.id}/lore/${w.entryId}`)
    const mark = page.getByRole('navigation', { name: 'LorEvolve' }).getByRole('link', { name: BRAND })
    await expect(mark).toHaveText('L')
    // Named for where it goes, not by a tooltip.
    await expect(mark).not.toHaveAttribute('title', /.*/)
    const box = (await mark.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(40)
    expect(box.height).toBeGreaterThanOrEqual(40)
    await mark.click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('The account menu: Go to, then the account', () => {
  test('its places work from a universe’s deepest screens, and its account items still do', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const manuscript = `/app/universes/${w.id}/stories/${w.storyId}/manuscript`

    await page.goto(manuscript)
    await openAccountMenu(page)
    const panel = page.getByTestId('account-menu-panel')
    const goTo = panel.getByRole('group', { name: 'Go to' })
    await expect(goTo.getByRole('link')).toHaveText(['My workspace', 'Ideas', 'Explore'])
    await expect(panel.getByRole('link', { name: 'Profile', exact: true })).toBeVisible()
    await expect(panel.getByText('View profile')).toHaveCount(0)

    await goTo.getByRole('link', { name: 'My workspace' }).click()
    await expect(page).toHaveURL('/app')
    await expect(tab(page, 'Universes')).toHaveAttribute('aria-current', 'page')

    await page.goto(manuscript)
    await openAccountMenu(page)
    await page.getByTestId('account-menu-ideas').click()
    await expect(page).toHaveURL('/app/ideas')

    await page.goto(manuscript)
    await openAccountMenu(page)
    await page.getByTestId('account-menu-explore').click()
    await expect(page).toHaveURL('/explore')

    await page.goto(`/app/universes/${w.id}/lore/${w.entryId}`)
    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveURL('/app/profile')
    // Back is the way to the exact screen that was left.
    await page.goBack()
    await expect(page).toHaveURL(`/app/universes/${w.id}/lore/${w.entryId}`)

    // The theme and the way out are where they were.
    await openAccountMenu(page)
    await page.getByTestId('theme-dark').click()
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('theme-light').click()
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('account-menu-signout').click()
    await expect(page).toHaveURL('/login')
  })
})

test.describe('A universe: up is All universes, inside its navigation', () => {
  test('the way up and the sections share one landmark, and the tab names section and universe', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)

    await page.goto('/app')
    await page.getByRole('link', { name: w.name }).click()
    const nav = page.getByRole('navigation', { name: 'Universe', exact: true })
    await expect(nav.getByRole('link', { name: 'All universes' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page).toHaveTitle(`Overview | ${w.name} | LorEvolve`)

    await nav.getByRole('link', { name: 'Lore', exact: true }).click()
    await expect(nav.getByRole('link', { name: 'Lore', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page).toHaveTitle(`Lore | ${w.name} | LorEvolve`)

    // A deep screen is still its section.
    await page.goto(`/app/universes/${w.id}/stories/${w.storyId}/manuscript`)
    await expect(page).toHaveTitle(`Stories | ${w.name} | LorEvolve`)
    await nav.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveTitle(`Settings | ${w.name} | LorEvolve`)

    await nav.getByRole('link', { name: 'All universes' }).click()
    await expect(page).toHaveURL('/app')
    await expect(page).toHaveTitle('Universes | LorEvolve')
  })
})

test.describe('Changing place moves the focus to what was opened', () => {
  test('portal, workspace, Profile and a universe each start on their main', async ({ page }) => {
    await signUp(page)
    const w = await world(page)

    await page.goto('/explore')
    await page.getByTestId('portal-workspace').click()
    await expect(page).toHaveURL('/app')
    await expect(main(page)).toBeFocused()

    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveURL('/app/profile')
    await expect(main(page)).toBeFocused()

    await tab(page, 'Universes').click()
    await page.getByRole('link', { name: w.name }).click()
    await expect(page.getByTestId('workspace-name')).toBeVisible()
    await expect(main(page)).toBeFocused()

    await page.getByRole('link', { name: 'All universes' }).click()
    await expect(page).toHaveURL('/app')
    await expect(main(page)).toBeFocused()

    await page.goto(`/app/universes/${w.id}/lore`)
    await openAccountMenu(page)
    await page.getByTestId('account-menu-profile').click()
    await expect(page).toHaveURL('/app/profile')
    await expect(main(page)).toBeFocused()
  })

  test('work on one screen keeps its focus: a filter, a section, a query string', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)

    // Typing into a filter is not a change of place, however long the list takes to answer.
    const filter = page.getByLabel('Filter universes')
    await filter.fill('Holl')
    await expect(page.getByRole('link', { name: w.name })).toBeVisible()
    await expect(filter).toBeFocused()
    await page.getByTestId('filter-all').click()
    await expect(page.getByTestId('filter-all')).toBeFocused()

    // Moving between a universe's sections leaves the focus on the section chosen.
    await page.goto(`/app/universes/${w.id}`)
    const stories = page
      .getByRole('navigation', { name: 'Universe', exact: true })
      .getByRole('link', { name: 'Stories' })
    await stories.click()
    await expect(page).toHaveURL(`/app/universes/${w.id}/stories`)
    await expect(stories).toBeFocused()
  })
})

test.describe('Narrow screens', () => {
  for (const width of [390, 360]) {
    test(`the workspace bar at ${width}px: two rows on purpose, every place reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)

      const brand = (await page.getByRole('link', { name: BRAND }).boundingBox())!
      const account = (await page.getByTestId('account-menu-trigger').boundingBox())!
      const universes = (await tab(page, 'Universes').boundingBox())!
      const ideas = (await tab(page, 'Ideas').boundingBox())!

      // Brand and account share the top row; the workspace's places share the one beneath, each a thumb's height.
      expect(Math.abs(brand.y + brand.height / 2 - (account.y + account.height / 2))).toBeLessThan(
        4,
      )
      expect(universes.y).toBeGreaterThanOrEqual(brand.y + brand.height)
      expect(Math.abs(universes.y - ideas.y)).toBeLessThan(1)
      expect(universes.height).toBeGreaterThanOrEqual(44)
      expect(universes.height).toBeLessThan(60)
      await expect(page.getByText('My workspace', { exact: true })).toBeVisible()
      expect(await sideways(page)).toBe(false)

      // Explore leaves the bar; the account menu holds it.
      await expect(page.getByTestId('home-explore')).toBeHidden()
      await tab(page, 'Ideas').click()
      await expect(page).toHaveURL('/app/ideas')
      await openAccountMenu(page)
      await page.getByTestId('account-menu-explore').click()
      await expect(page).toHaveURL('/explore')
    })
  }

  test('a universe at 360px keeps its folded bar and Sections sheet, All universes at its head', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await signUp(page)
    const w = await world(page)

    await page.goto(`/app/universes/${w.id}/lore/${w.entryId}`)
    await expect(page.getByTestId('workspace-where')).toContainText('Lore')
    const toggle = page.getByTestId('workspace-nav-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const nav = page.getByRole('navigation', { name: 'Universe', exact: true })
    await nav.getByRole('link', { name: 'All universes' }).click()
    await expect(page).toHaveURL('/app')
    expect(await sideways(page)).toBe(false)
  })

  test('the account menu at 360px holds a long address inside the screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    const email = `${unique('a.very.long.address.')}@subdomain.example-publishing-house.test`
    await signUp(page, email)

    await openAccountMenu(page)
    const panel = (await page.getByTestId('account-menu-panel').boundingBox())!
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(360)
    const address = page.locator('.accountmenu__email')
    await expect(address).toHaveText(email)
    const box = (await address.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width)
    expect(await sideways(page)).toBe(false)
  })

  test('at 200% zoom the bar still fits on one row, and nothing scrolls sideways', async ({
    page,
  }) => {
    // 1440 css pixels at 200% is a 720px viewport.
    await page.setViewportSize({ width: 720, height: 450 })
    await signUp(page)

    const brand = (await page.getByRole('link', { name: BRAND }).boundingBox())!
    const universes = (await tab(page, 'Universes').boundingBox())!
    expect(
      Math.abs(brand.y + brand.height / 2 - (universes.y + universes.height / 2)),
    ).toBeLessThan(4)
    await expect(page.getByTestId('home-explore')).toBeVisible()
    expect(await sideways(page)).toBe(false)
  })

  test('an account name written right to left reads in its own direction in the menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await signUp(page)
    // Usernames are Latin by the API's rules; the name is given another direction here to prove the menu would hold it.
    await page.route('**/api/auth/me', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { username: string }
      await route.fulfill({
        response,
        json: { ...body, username: `مؤلف_الساحل_الغارق_${body.username}` },
      })
    })
    await page.reload()

    await openAccountMenu(page)
    const name = page.locator('.accountmenu__username')
    await expect(name).toContainText('مؤلف')
    expect(await name.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl')
    const panel = (await page.getByTestId('account-menu-panel').boundingBox())!
    expect(panel.x + panel.width).toBeLessThanOrEqual(360)
    expect(await sideways(page)).toBe(false)
  })
})
