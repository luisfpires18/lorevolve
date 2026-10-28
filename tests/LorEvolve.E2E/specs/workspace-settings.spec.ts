import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'
import { answerConfirms } from './support/confirm'

/**
 * UI refinement 014: the workspace's information architecture. LorEvolve's brand leads to the portal from everywhere;
 * publishing is a page of its own, Publish, just above Settings; Settings is four tabs in the one page shell, with a
 * universe's colour the author's own and no palette; and LorEvolve opens on the portal - signed in or out, whatever was used
 * last - while a deep link still goes where it says.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('ia')
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
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function universe(page: Page, accentColor: string | null = null) {
  const name = unique('Saltmere ')
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: 'Private notes.',
    accentColor,
  }))!.id
  return { id, name }
}

/** Everything publishing needs, saved - so the page's own Publish can be pressed. */
async function readyToPublish(page: Page, id: string) {
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 4,
    genres: [1],
  })
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: { name: 'a.png', mimeType: 'image/png', buffer: png(800, 500, () => [40, 70, 120]) },
    },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: unique('Ione ') })
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function fresh(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

test.describe('LorEvolve leads home', () => {
  test('the brand goes to LorEvolve’s home from the workspace, its headers, the portal and sign-in, keeping the theme', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)

    await page.evaluate(() => localStorage.setItem('lorevolve-theme', 'dark'))
    await page.goto(`/app/universes/${w.id}/lore`)
    await page.locator('.rail__mark').click()
    await page.waitForURL('/')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    for (const from of ['/app', '/app/ideas', '/app/profile']) {
      await page.goto(from)
      await page.getByTestId('home-brand').click()
      await page.waitForURL('/')
    }

    await page.goto('/explore')
    await page.locator('.portal__brand').click()
    await page.waitForURL('/')

    // My workspace is still the deliberate way in.
    await page.getByTestId('portal-workspace').click()
    await page.waitForURL('/app')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    await page.getByTestId('account-menu-trigger').click()
    await page.getByTestId('account-menu-signout').click()
    await page.waitForURL('/login')
    await page.getByTestId('auth-brand').click()
    await page.waitForURL('/')
  })
})

test.describe('Publish', () => {
  test('sits just above Settings, holds everything publishing, and Settings no longer does', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await page.goto(`/app/universes/${w.id}`)

    const sections = page.getByRole('navigation', { name: 'Universe', exact: true })
    // Publish is the upkeep row's middle, directly above Settings.
    await expect(page.getByTestId('sidebar-upkeep').getByRole('link')).toHaveText([
      'Trash',
      'Publish',
      'Settings',
    ])
    const links = (await sections.getByRole('link').allTextContents()).map((text) => text.trim())
    expect(links.indexOf('Publish')).toBe(links.indexOf('Settings') - 1)

    await page.getByTestId('workspace-settings').click()
    await expect(page.getByTestId('settings-tabs')).toBeVisible()
    await expect(page.getByTestId('public-portal')).toHaveCount(0)
    await expect(page.getByText('Public summary')).toHaveCount(0)

    await page.getByTestId('workspace-publish').click()
    await page.waitForURL(`/app/universes/${w.id}/publish`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Publish')
    await expect(page.getByTestId('publication-status')).toContainText('Private')
    await expect(page.getByTestId('publication-checklist')).toBeVisible()
    await expect(page.getByTestId('view-public-page')).toHaveCount(0)

    // Publishing still needs everything: refused and listed first, then done through the confirmation.
    await page.getByTestId('publish').click()
    await expect(page.getByTestId('publication-problem')).toContainText('public summary')
    await readyToPublish(page, w.id)
    await page.reload()
    await page.getByTestId('publish').click()
    await page.getByTestId('confirm-publish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Public')
    await expect(page.getByTestId('published-lore')).toHaveText('0 public')

    // View public world opens the real public page.
    await page.getByTestId('view-public-page').click()
    await page.waitForURL(/\/worlds\/saltmere-/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(w.name)
    const worldUrl = page.url()

    // Make private is explicit and confirmed, and it takes the page down.
    await page.goBack()
    await page.getByTestId('unpublish').click()
    await page.getByTestId('confirm-unpublish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Private')
    const reader = await fresh(browser)
    await reader.page.goto(worldUrl)
    await expect(reader.page.getByTestId('world-missing')).toBeVisible()
    await reader.context.close()
  })
})

test.describe('the sidebar, Chronology and the theme control (014 follow-up)', () => {
  test('worldbuilding above, upkeep apart below; Chronology a section after World Rules, not a Settings tab', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await page.goto(`/app/universes/${w.id}`)

    const sections = page.getByRole('navigation', { name: 'Universe', exact: true })
    // The way up, All universes, then an owner's fifteen sections, in order.
    await expect(sections.getByRole('link')).toHaveText([
      'All universes',
      'Overview',
      'Lore',
      'Types',
      'Family Tree',
      'Maps',
      'World Rules',
      'Canon',
      'Chronology',
      'Stories',
      'Timeline',
      'Ideas',
      'AI Changes',
      'Trash',
      'Publish',
      'Settings',
    ])
    const upkeep = page.getByTestId('sidebar-upkeep')
    await expect(upkeep.getByRole('link')).toHaveText(['Trash', 'Publish', 'Settings'])

    // Chronology is a page of its own, with its editor, and Settings has no trace of it.
    await page.getByTestId('workspace-chronology').click()
    await page.waitForURL(`/app/universes/${w.id}/chronology`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chronology')
    await expect(sections.getByRole('link', { name: 'Chronology' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('chronology-settings')).toContainText(
      'This universe uses plain numbered years.',
    )
    await page.getByTestId('add-era').click()
    await page.getByTestId('era-name').fill('Before the Flood')
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')

    await page.getByTestId('workspace-settings').click()
    await expect(page.getByRole('tab')).toHaveText([
      'General',
      'Appearance',
      'Collaborators',
      'Data',
      'Advanced',
    ])
    await expect(page.getByTestId('chronology-settings')).toHaveCount(0)

    // Browser history moves between the two pages as it does between any sections.
    await page.goBack()
    await expect(page).toHaveURL(`/app/universes/${w.id}/chronology`)
    await expect(page.getByTestId('era')).toHaveCount(1)
  })

  test('every workspace page - Chronology, Settings and Publish included - wears one page shell, like World Rules', async ({
    page,
  }) => {
    // Five widths across eleven pages: the loop is the test, and CI is slower than a desk (Deploy DEV #53).
    test.setTimeout(180_000)
    await signUp(page)
    const w = await universe(page)
    const frame = async (segment: string) => {
      await page.goto(`/app/universes/${w.id}/${segment}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      return page.evaluate(() => {
        const title = document.querySelector('h1')!.getBoundingClientRect()
        const actions = document.querySelector('.pageheader__actions')?.getBoundingClientRect()
        return {
          x: Math.round(title.x),
          y: Math.round(title.y),
          actionsLeft: actions ? Math.round(actions.left) : null,
          actionsRight: actions ? Math.round(actions.right) : null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
    }

    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
      { width: 360, height: 780 },
    ]) {
      await page.setViewportSize(size)
      const rules = await frame('world-rules')
      const chronology = await frame('chronology')
      expect({ x: chronology.x, y: chronology.y }, `${size.width}`).toEqual({
        x: rules.x,
        y: rules.y,
      })
      // The primary action: at the header's far end on a wide screen, stacked under the title on a narrow one.
      if (size.width >= 820) expect(chronology.actionsRight).toBe(rules.actionsRight)
      else expect(chronology.actionsLeft).toBe(rules.actionsLeft)
      expect(chronology.overflow).toBeLessThanOrEqual(0)
      // One shell: configuration included, no page starts anywhere else.
      for (const segment of [
        'lore',
        'stories',
        'timeline',
        'ideas',
        'canon',
        'types',
        'trash',
        'publish',
        'settings',
      ]) {
        const other = await frame(segment)
        expect({ x: other.x, y: other.y }, `${segment} at ${size.width}`).toEqual({
          x: rules.x,
          y: rules.y,
        })
        expect(other.overflow).toBeLessThanOrEqual(0)
      }
    }

    // Add date period is the header's primary action; the new period's name takes the focus, and Save sits with the editor.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/app/universes/${w.id}/chronology`)
    await expect(page.getByTestId('save-chronology')).toHaveCount(0)
    const header = page.locator('.pageheader')
    await header.getByTestId('add-era').click()
    await expect(page.getByTestId('era-name')).toBeFocused()
    await page.keyboard.type('Before the Flood')
    const editor = page.getByTestId('chronology-settings')
    await editor.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')
    await expect(page.getByTestId('era')).toHaveCount(1)
  })

  test('the theme control is one segmented control of two equal halves, worked from the keyboard', async ({
    page,
  }) => {
    await signUp(page)
    await page.evaluate(() => localStorage.setItem('lorevolve-theme', 'light'))
    await page.goto('/app')
    await page.getByTestId('account-menu-trigger').click()

    const track = page.getByTestId('account-menu-panel').getByRole('group', { name: 'Theme' })
    const light = track.getByRole('button', { name: 'Light' })
    const dark = track.getByRole('button', { name: 'Dark' })
    const [l, d, t] = [
      (await light.boundingBox())!,
      (await dark.boundingBox())!,
      (await track.boundingBox())!,
    ]
    expect(Math.abs(l.width - d.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(l.y - d.y)).toBeLessThanOrEqual(1)
    // The two halves fill the menu's width between them.
    expect(l.width + d.width).toBeGreaterThan(t.width - 12)

    await expect(light).toHaveAttribute('aria-pressed', 'true')
    await light.focus()
    await page.keyboard.press('ArrowDown')
    await expect(dark).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    await expect(light).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    // The menu stays open, and pressing the chosen half does not change its size.
    await expect(page.getByTestId('account-menu-panel')).toBeVisible()
    expect(Math.abs((await dark.boundingBox())!.width - d.width)).toBeLessThanOrEqual(1)
  })
})

test.describe('Settings', () => {
  test('five keyboard tabs under the page header, forms in a readable column, and destructive ones in Advanced', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await page.setViewportSize({ width: 1536, height: 900 })
    await page.goto(`/app/universes/${w.id}/settings`)

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['General', 'Appearance', 'Collaborators', 'Data', 'Advanced'])
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tabpanel')).toHaveCount(1)

    // The page starts where every page starts; the tabs sit in its header; only the forms keep a readable column,
    // left-aligned under the title rather than centred away from it.
    const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    const tablist = (await page.getByRole('tablist').boundingBox())!
    const body = (await page.locator('.settings__body').boundingBox())!
    expect(Math.abs(tablist.x - title.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(body.x - title.x)).toBeLessThanOrEqual(1)
    expect(body.width).toBeLessThan(800)
    expect(await page.locator('.pageheader').getByRole('tablist').count()).toBe(1)

    // Arrows move and choose; the address says which, and replacing it means Back leaves Settings.
    await page.getByRole('tab', { name: 'General' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeFocused()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page).toHaveURL(/\/settings\?tab=appearance$/)
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Advanced' })).toBeFocused()

    const advanced = page.getByRole('tabpanel', { name: 'Advanced' })
    await expect(advanced.getByTestId('toggle-archive')).toBeVisible()
    await expect(advanced.getByTestId('delete-needs-archive')).toBeVisible()

    await page.getByRole('tab', { name: 'Data' }).click()
    const data = page.getByRole('tabpanel', { name: 'Data' })
    await expect(data.getByTestId('export-universe')).toBeVisible()
    await expect(data.getByTestId('settings-restore-link')).toBeVisible()
    await expect(page.getByTestId('delete-universe')).toBeHidden()

    // Archived, delete is in Advanced's danger panel and nowhere else.
    await page.getByRole('tab', { name: 'Advanced' }).click()
    await advanced.getByTestId('toggle-archive').click()
    await expect(advanced.getByTestId('danger-section')).toBeVisible()
    for (const other of ['General', 'Appearance', 'Collaborators', 'Data']) {
      await expect(
        page
          .getByRole('tabpanel', { name: other, includeHidden: true })
          .getByTestId('delete-universe'),
      ).toHaveCount(0)
    }

    await page.goto(`/app/universes/${w.id}/lore`)
    await page.goto(`/app/universes/${w.id}/settings?tab=data`)
    await page.goBack()
    await expect(page).toHaveURL(`/app/universes/${w.id}/lore`)
  })

  test('the colour is the author’s own, with no palette, and a stored colour stays as it was', async ({
    page,
  }) => {
    await signUp(page)
    // One of the old palette's colours, stored before 014.
    const w = await universe(page, '#1f8f74')
    await page.goto(`/app/universes/${w.id}/settings?tab=appearance`)
    const appearance = page.getByRole('tabpanel', { name: 'Appearance' })

    await expect(appearance.getByRole('radio')).toHaveCount(0)
    await expect(appearance.getByText('Lapis')).toHaveCount(0)
    const hex = appearance.getByTestId('universe-colour-hex')
    await expect(hex).toHaveValue('#1f8f74')
    await expect(appearance.getByTestId('universe-colour-picker')).toHaveValue('#1f8f74')

    // Saving General leaves the colour alone.
    await page.getByRole('tab', { name: 'General' }).click()
    await page.getByLabel('Description').fill('Renamed notes.')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByTestId('settings-saved')).toBeVisible()
    let stored = await api<{ accentColor: string | null; description: string }>(
      page,
      'GET',
      `/api/universes/${w.id}`,
    )
    expect(stored.accentColor).toBe('#1f8f74')
    expect(stored.description).toBe('Renamed notes.')

    // A colour that is not one is said so, and not saved.
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await hex.fill('#12zz45')
    await expect(appearance.getByRole('alert')).toContainText('Use a colour like')
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    stored = await api(page, 'GET', `/api/universes/${w.id}`)
    expect(stored.accentColor).toBe('#1f8f74')

    // Any colour, typed without its #, is kept as the author chose it; and the description is left alone.
    await hex.fill('8B3242')
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    await expect(page.getByTestId('settings-colour-saved')).toBeVisible()
    stored = await api(page, 'GET', `/api/universes/${w.id}`)
    expect(stored.accentColor).toBe('#8b3242')
    expect(stored.description).toBe('Renamed notes.')

    // And none.
    await appearance.getByTestId('universe-colour-clear').click()
    await appearance.getByRole('button', { name: 'Save colour' }).click()
    await expect
      .poll(
        async () =>
          (await api<{ accentColor: string | null }>(page, 'GET', `/api/universes/${w.id}`))!
            .accentColor,
      )
      .toBeNull()
  })

  test('unsaved work survives changing tabs, and two unsaved tabs are one question when leaving', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    const asked: string[] = []
    let leave = false
    await answerConfirms(page, () => leave, asked)

    await page.goto(`/app/universes/${w.id}/settings`)
    await page.getByLabel('Description').fill('Half a thought.')
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect.poll(() => asked).toEqual([])
    await page.getByTestId('universe-colour-hex').fill('#336699')
    await page.getByRole('tab', { name: 'General' }).click()
    await expect(page.getByLabel('Description')).toHaveValue('Half a thought.')

    // Leaving for the portal asks once, for both, and staying keeps both.
    await page.locator('.rail__mark').click()
    await expect.poll(() => asked).toHaveLength(1)
    await expect(page).toHaveURL(/\/settings$/)
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect(page.getByTestId('universe-colour-hex')).toHaveValue('#336699')

    leave = true
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(2)
  })

  test('Settings and Publish reflow on a phone and at 200% zoom, light and dark', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const setup = await browser.newContext()
    const owner = await setup.newPage()
    await signUp(owner)
    const w = await universe(owner)
    await api(owner, 'PUT', `/api/universes/${w.id}`, {
      name: `${w.name} with an extraordinarily long name that keeps on going`,
      description: null,
      accentColor: null,
    })
    const state = await setup.storageState()
    await setup.close()

    for (const theme of ['light', 'dark']) {
      for (const size of [
        { width: 360, height: 780, deviceScaleFactor: 1 },
        { width: 390, height: 844, deviceScaleFactor: 1 },
        { width: 640, height: 400, deviceScaleFactor: 2 },
      ]) {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: size.deviceScaleFactor,
          storageState: state,
        })
        await context.addInitScript((t) => localStorage.setItem('lorevolve-theme', t), theme)
        const page = await context.newPage()
        await page.goto(`/app/universes/${w.id}/chronology`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chronology')
        expect(await noSideways(page), `${theme} ${size.width} chronology`).toBeLessThanOrEqual(0)

        await page.goto(`/app/universes/${w.id}/publish`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Publish')
        expect(await noSideways(page), `${theme} ${size.width} publish`).toBeLessThanOrEqual(0)

        for (const tab of ['general', 'appearance', 'data', 'advanced']) {
          await page.goto(`/app/universes/${w.id}/settings?tab=${tab}`)
          const chosen = page.getByTestId(`settings-tab-${tab}`)
          await expect(chosen).toHaveAttribute('aria-selected', 'true')
          await chosen.scrollIntoViewIfNeeded()
          await expect(chosen).toBeInViewport()
          await expect(page.getByTestId(`settings-panel-${tab}`)).toBeVisible()
          expect(await noSideways(page), `${theme} ${size.width} ${tab}`).toBeLessThanOrEqual(0)
        }
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
        await context.close()
      }
    }
  })
})

test.describe('LorEvolve opens on the portal', () => {
  test('signed out, the front door and any unknown address are LorEvolve’s home, never Login; the installed app opens Explore; a workspace link still asks', async ({
    browser,
  }) => {
    const { context, page } = await fresh(browser)
    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest.start_url).toBe('/explore')
    expect(manifest.id).toBe('/app')

    await page.goto(manifest.start_url)
    await expect(page).toHaveURL('/explore')
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    await page.goto('/somewhere-nobody-links')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing')).toBeVisible()

    // An explicit workspace address is a deep link, and follows the sign-in rules.
    await page.goto('/app/universes')
    await page.waitForURL('/login')
    await context.close()
  })

  test('signed in, having used the workspace, the front door is still the portal, and deep links go where they say', async ({
    page,
  }) => {
    await signUp(page)
    const w = await universe(page)
    await readyToPublish(page, w.id)
    const slug = (await api<{ publicSlug: string }>(
      page,
      'POST',
      `/api/universes/${w.id}/publish`,
    ))!.publicSlug
    await page.goto(`/app/universes/${w.id}/timeline`)

    // A cold launch is the manifest's start_url in a new window: the portal, with the way in offered, not taken.
    const launch = await page.context().newPage()
    await launch.goto('/explore')
    await expect(launch).toHaveURL('/explore')
    await expect(launch.getByTestId('portal-workspace')).toBeVisible()
    await launch.goto('/')
    await expect(launch).toHaveURL('/')
    await expect(launch.getByTestId('landing-primary')).toHaveText('Go to my workspace')
    await launch.goto('/not-a-page')
    await expect(launch).toHaveURL('/')

    await launch.goto(`/worlds/${slug}`)
    await expect(launch.getByRole('heading', { level: 1 })).toHaveText(w.name)
    await launch.goto(`/app/universes/${w.id}/timeline`)
    await expect(launch.getByRole('heading', { level: 1 })).toHaveText('Timeline')
    await launch.goto('/app/not-a-page')
    await expect(launch).toHaveURL('/app')
  })
})
