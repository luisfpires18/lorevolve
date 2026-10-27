import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Public portal 012: the final polish and hardening pass. What a browser has to show: a restore from the Trash that would
 * publish again asks first and says what it will do, archiving a public universe says it stays public, the one action
 * order in editors and drawers, the head a crawler reads (server-rendered, fetched straight from the API host, which in
 * development serves the source shell) and the tab title the app keeps, the sitemap, error and zoom states. The server's
 * rules themselves - predicates, canonical origin, robots - are pinned by `SeoTests`.
 *
 * Every test builds its own author.
 */
const PASSWORD = 'Test-password-123!'
const API = process.env.LOREVOLVE_API_URL ?? 'http://localhost:5180'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('polish')
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

interface World {
  id: string
  slug: string
  name: string
}

/** A universe with everything publishing needs; published unless asked not to be. */
async function world(page: Page, author: string, publish = true): Promise<World> {
  const name = unique('Saltmere ')
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: 'Private description: the heir dies.',
  }))!.id
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
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: author })
  const state = publish
    ? await api<{ publicSlug: string }>(page, 'POST', `/api/universes/${id}/publish`)
    : null
  return { id, slug: state?.publicSlug ?? '', name }
}

async function entry(page: Page, w: World, name: string, publish = true) {
  const types = (await api<{ id: string }[]>(page, 'GET', `/api/universes/${w.id}/entity-types`))!
  const id = (await api<{ id: string }>(page, 'POST', `/api/universes/${w.id}/entities`, {
    entityTypeId: types[0].id,
    name,
    summary: `The lead of ${name}.`,
    canonStatus: 1,
    aliases: [],
    tags: [],
    fields: [],
  }))!.id
  if (publish) await api(page, 'POST', `/api/universes/${w.id}/entities/${id}/publish`)
  return id
}

async function story(page: Page, w: World, title: string, publicSummary: string) {
  const id = (await api<{ id: string }>(page, 'POST', `/api/universes/${w.id}/stories`, {
    title,
    premise: 'Private premise: the narrator lies.',
    status: 1,
  }))!.id
  await api(page, 'PUT', `/api/universes/${w.id}/stories/${id}/publication`, { publicSummary })
  await api(page, 'POST', `/api/universes/${w.id}/stories/${id}/publish`)
  return id
}

function slugOf(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function stranger(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

/** The head the server sent for a path: fetched from the API host, which renders the shell itself. */
async function head(page: Page, path: string) {
  const response = await page.request.get(`${API}${path}`)
  const html = await response.text()
  const meta = (attribute: string, key: string) =>
    html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`))?.[1] ?? null
  return {
    status: response.status(),
    html,
    title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
    canonical: html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null,
    meta,
  }
}

test.describe('publication edge cases', () => {
  test('restoring a public entry asks first, and restoring publishes it again', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '))
    const id = await entry(page, w, 'Returning Keeper')
    await api(page, 'DELETE', `/api/universes/${w.id}/entities/${id}`)

    await page.goto(`/app/universes/${w.id}/trash`)
    await page.getByTestId('restore-Returning Keeper').click()
    const confirm = page.getByTestId('trash-publication-confirm')
    await expect(confirm).toBeFocused()
    await expect(confirm).toHaveAttribute('data-publication', 'visible')
    await expect(confirm).toContainText('makes it public again')
    await expect(confirm).toContainText('This entry was public before it was moved to the Trash')

    // Cancel changes nothing and hands the focus back to the row's Restore.
    await page.getByTestId('trash-confirm-cancel').click()
    await expect(confirm).toHaveCount(0)
    await expect(page.getByTestId('restore-Returning Keeper')).toBeFocused()

    await page.getByTestId('restore-Returning Keeper').click()
    await page.getByTestId('trash-confirm-restore').click()
    await expect(page.getByTestId('trash-message')).toContainText('is back in your lore')

    const reader = await stranger(browser)
    await reader.page.goto(`/worlds/${w.slug}/lore/returning-keeper`)
    await expect(reader.page.getByRole('heading', { level: 1 })).toHaveText('Returning Keeper')
    await reader.context.close()
  })

  test('a public story can be restored as private, and stays off the portal', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '))
    const id = await story(page, w, 'The Tide Count', 'For readers.')
    await api(page, 'DELETE', `/api/universes/${w.id}/stories/${id}`)

    await page.goto(`/app/universes/${w.id}/trash`)
    await page.getByTestId('restore-The Tide Count').click()
    const confirm = page.getByTestId('trash-publication-confirm')
    await expect(confirm).toContainText('This story was public before it was moved to the Trash')
    await page.getByTestId('trash-confirm-private').click()
    await expect(page.getByTestId('trash-message')).toContainText('It is private now.')

    const reader = await stranger(browser)
    await reader.page.goto(`/worlds/${w.slug}/stories/the-tide-count`)
    await expect(reader.page.getByTestId('story-missing')).toBeVisible()
    await reader.context.close()
  })

  test('in a private universe the question never claims a restore makes anything visible', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '), false)
    const id = await entry(page, w, 'Quiet Keeper')
    await api(page, 'DELETE', `/api/universes/${w.id}/entities/${id}`)

    await page.goto(`/app/universes/${w.id}/trash`)
    await page.getByTestId('restore-Quiet Keeper').click()
    const confirm = page.getByTestId('trash-publication-confirm')
    await expect(confirm).toHaveAttribute('data-publication', 'hidden')
    await expect(confirm).toContainText('is still selected for publication')
    await expect(confirm).toContainText('Readers cannot see it now')
    await expect(confirm).not.toContainText('makes it public again')
    await expect(page.getByTestId('trash-confirm-restore')).toHaveText('Restore, keep selected')
  })

  test('archiving a public universe says it stays public, and it does', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '))

    await page.goto(`/app/universes/${w.id}/settings?tab=advanced`)
    await page.getByTestId('toggle-archive').click()
    const confirm = page.getByTestId('archive-public-confirm')
    await expect(confirm).toBeFocused()
    await expect(confirm).toContainText('It stays public.')
    await expect(confirm).toContainText('until you make it private on Publish')

    // The obvious way to take it down instead leads to Publish, and its own control (014).
    await page.getByTestId('archive-go-private').click()
    await page.waitForURL(`/app/universes/${w.id}/publish`)
    await expect(page.getByTestId('unpublish')).toBeVisible()
    await page.goto(`/app/universes/${w.id}/settings?tab=advanced`)

    await page.getByTestId('toggle-archive').click()
    await page.getByTestId('cancel-archive').click()
    await expect(page.getByTestId('toggle-archive')).toBeFocused()

    await page.getByTestId('toggle-archive').click()
    await page.getByTestId('confirm-archive').click()
    await expect(page.getByTestId('archived-still-public')).toContainText('Still public.')
    await expect(page.getByTestId('danger-section')).toBeVisible()

    const reader = await stranger(browser)
    await reader.page.goto(`/worlds/${w.slug}`)
    await expect(reader.page.getByRole('heading', { level: 1 })).toHaveText(w.name)
    await reader.context.close()
  })

  test('archiving a private universe asks nothing', async ({ page }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '), false)
    await page.goto(`/app/universes/${w.id}/settings?tab=advanced`)
    await page.getByTestId('toggle-archive').click()
    await expect(page.getByTestId('danger-section')).toBeVisible()
    await expect(page.getByTestId('archive-public-confirm')).toHaveCount(0)
    await expect(page.getByTestId('archived-still-public')).toHaveCount(0)
  })
})

test.describe('one action order', () => {
  test('editors and drawers put the primary action first, in sight and in Tab order', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '), false)
    const id = await entry(page, w, 'Ordered Keeper', false)

    // The entry form's bar: Save, then Cancel.
    await page.goto(`/app/universes/${w.id}/lore/${id}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const save = page.getByTestId('save-entity')
    const cancel = page.getByTestId('cancel-entity')
    expect((await save.boundingBox())!.x).toBeLessThan((await cancel.boundingBox())!.x)
    await save.focus()
    await page.keyboard.press('Tab')
    await expect(cancel).toBeFocused()

    // A drawer: Create, then Cancel - and a new item's drawer no longer says "new" twice.
    await page.goto(`/app/universes/${w.id}/timeline`)
    await page.getByTestId('new-moment').click()
    const drawer = page.getByTestId('moment-form')
    await expect(drawer.getByRole('heading', { name: 'New moment' })).toBeVisible()
    await expect(drawer).not.toContainText('A new moment')
    await page.getByTestId('save-moment').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('cancel-moment')).toBeFocused()
  })
})

test.describe('search and social metadata', () => {
  test('a public page carries its own head in the HTML the server sends, from public text only', async ({
    page,
  }) => {
    await signUp(page)
    const author = unique('Ione ')
    const w = await world(page, author)
    await story(page, w, 'The Glass Ebb', 'A tide that counts the drowned.')

    const universe = await head(page, `/worlds/${w.slug}`)
    expect(universe.status).toBe(200)
    expect(universe.title).toBe(`${w.name} | LorEvolve`)
    expect(universe.meta('name', 'description')).toBe('A drowned coast where the tide keeps count.')
    expect(universe.meta('name', 'robots')).toBe('index,follow')
    expect(universe.canonical).toBe(`http://localhost:5173/worlds/${w.slug}`)
    expect(universe.meta('property', 'og:image')).toContain(
      `/api/public/universes/${w.slug}/artwork/card/`,
    )
    expect(universe.html).not.toContain('Private description')

    const told = await head(page, `/worlds/${w.slug}/stories/the-glass-ebb`)
    expect(told.title).toBe(`The Glass Ebb | ${w.name} | LorEvolve`)
    expect(told.meta('name', 'description')).toBe('A tide that counts the drowned.')
    expect(told.meta('property', 'og:description')).toBe('A tide that counts the drowned.')
    expect(told.html).not.toContain('Private premise')

    // The app keeps the tab title in the same words while moving between pages.
    await page.goto(`/worlds/${w.slug}`)
    await expect(page).toHaveTitle(`${w.name} | LorEvolve`)
    await page.goto('/explore')
    await expect(page).toHaveTitle('Explore Worlds | LorEvolve')
  })

  test('the workspace and the account are noindex, and a missing public page is a 404', async ({
    page,
  }) => {
    for (const path of ['/app', '/app/profile', '/login', '/register']) {
      const shell = await head(page, path)
      expect(shell.meta('name', 'robots'), path).toBe('noindex,nofollow')
      expect(shell.canonical, path).toBeNull()
    }
    const missing = await head(page, '/worlds/nobody-holds-this-address')
    expect(missing.status).toBe(404)
    expect(missing.meta('name', 'robots')).toBe('noindex,nofollow')
  })

  test('the sitemap holds only what is public and loses an item when it is unpublished', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '))
    const shown = await entry(page, w, 'Mapped Keeper')
    await entry(page, w, 'Unmapped Heir', false)

    const quiet = await stranger(page.context().browser()!)
    await signUp(quiet.page)
    const hidden = await world(quiet.page, unique('Nobody '), false)
    await entry(quiet.page, hidden, 'Selected In Private')

    const read = async () => (await page.request.get('/sitemap.xml')).text()
    let map = await read()
    expect(map).toContain(`/worlds/${w.slug}/lore/mapped-keeper</loc>`)
    expect(map).not.toContain('unmapped-heir')
    expect(map).not.toContain(slugOf(hidden.name))
    expect(map).not.toContain('selected-in-private')
    expect(map).not.toContain('/app')
    expect(map).not.toContain('/api/')

    await api(page, 'POST', `/api/universes/${w.id}/entities/${shown}/unpublish`)
    map = await read()
    expect(map).not.toContain('mapped-keeper')

    // An author whose worlds are all private is not listed either.
    const author = (await api<{ authorSlug: string }>(
      page,
      'GET',
      `/api/public/universes/${w.slug}`,
    ))!.authorSlug
    expect(map).toContain(`/authors/${author}</loc>`)
    await api(page, 'POST', `/api/universes/${w.id}/unpublish`)
    map = await read()
    expect(map).not.toContain(`/authors/${author}<`)
    await quiet.context.close()
  })
})

test.describe('states and zoom', () => {
  test('a public page that cannot load says so and recovers, and never shows browser error text', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Ione '))

    await page.route(`**/api/public/universes/${w.slug}`, (route) => route.abort('failed'))
    await page.goto(`/worlds/${w.slug}`)
    await expect(page.getByTestId('public-error')).toBeVisible()
    await expect(page.getByTestId('public-error')).not.toContainText('Failed to fetch')
    await expect(page.locator('.portal')).toBeVisible()

    await page.unroute(`**/api/public/universes/${w.slug}`)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(w.name)

    // The workspace says the same in words, not the browser's.
    await page.route('**/api/universes?**', (route) => route.abort('failed'))
    await page.goto('/app')
    await expect(page.getByRole('alert')).toContainText('LorEvolve could not be reached')
  })

  test('key screens reflow at 200% zoom and on the narrowest phones without sideways scrolling', async ({
    browser,
  }) => {
    // About thirty navigations plus a sign-up and a picture upload: ~21 s here, most of Playwright's default 30 s. Its
    // sibling in theme.spec.ts, the same loop, timed out on CI on all three attempts (Deploy DEV #53) with every page
    // rendering in ~0.4 s. The loop is the test; its budget says so.
    test.setTimeout(120_000)
    const setup = await browser.newContext()
    const owner = await setup.newPage()
    await signUp(owner)
    const w = await world(owner, unique('Maximiliana Wolfeschlegelsteinhausen '))
    await entry(owner, w, 'Archivist of the Seventeen Drowned Libraries')
    await story(owner, w, 'A Very Long Story Title About the Tide That Counts', 'For readers.')
    const state = await setup.storageState()

    const portal = [
      '/explore',
      `/worlds/${w.slug}`,
      `/worlds/${w.slug}/lore/archivist-of-the-seventeen-drowned-libraries`,
      `/worlds/${w.slug}/stories/a-very-long-story-title-about-the-tide-that-counts`,
      '/login',
    ]
    const workspace = [
      '/app',
      `/app/universes/${w.id}/lore`,
      `/app/universes/${w.id}/timeline`,
      `/app/universes/${w.id}/settings`,
      `/app/universes/${w.id}/trash`,
      '/app/profile',
    ]

    // 1280 x 800 at 200% is a 640 x 400 layout drawn at twice the pixels; 360 and 390 are the phones.
    for (const size of [
      { width: 640, height: 400, deviceScaleFactor: 2 },
      { width: 390, height: 844, deviceScaleFactor: 1 },
      { width: 360, height: 780, deviceScaleFactor: 1 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.deviceScaleFactor,
        storageState: state,
      })
      const page = await context.newPage()
      for (const path of [...portal, ...workspace]) {
        if (path === '/login') continue
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await noSidewaysScroll(page)
      }
      await context.close()
    }

    const anonymous = await browser.newContext({
      viewport: { width: 640, height: 400 },
      deviceScaleFactor: 2,
    })
    const reader = await anonymous.newPage()
    await reader.goto('/login')
    await expect(reader.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await noSidewaysScroll(reader)
    await anonymous.close()
    await setup.close()
  })
})
