import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * UI refinement 013: one LorEvolve theme. Light or Dark applies to the public portal and the workspace at once; with no
 * choice saved it follows the system, once chosen it is kept in this browser through navigation, reloads, a new
 * window, signing in and signing out. It is on `<html>` before the first paint, it never touches the server-rendered
 * head, and each product keeps its own look in both.
 *
 * The theme is read from `data-theme` and from computed colours, never from pictures.
 */
const PASSWORD = 'Test-password-123!'
const API = process.env.LOREVOLVE_API_URL ?? 'http://localhost:5180'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('theme')
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

/** A published world, so the portal has a real page with artwork. */
async function world(page: Page) {
  const name = unique('Themed World ')
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: null,
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
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: unique('Ione ') })
  const slug = (await api<{ publicSlug: string }>(page, 'POST', `/api/universes/${id}/publish`))!
    .publicSlug
  return { id, slug, name }
}

const themeOf = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
const ground = (page: Page, selector = 'body') =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, selector)

/** Relative luminance of a computed `rgb(...)`: dark below 0.2, light above 0.6. */
function luminance(color: string) {
  const [r, g, b] = color
    .match(/\d+(\.\d+)?/g)!
    .slice(0, 3)
    .map(Number)
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

async function fresh(browser: Browser, colorScheme: 'light' | 'dark') {
  const context = await browser.newContext({ colorScheme })
  return { context, page: await context.newPage() }
}

test.describe('one theme', () => {
  test('with nothing chosen, LorEvolve follows the system, portal and workspace alike', async ({
    browser,
  }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const { context, page } = await fresh(browser, scheme)
      await page.goto('/explore')
      expect(await themeOf(page)).toBe(scheme)
      await page.goto('/login')
      expect(await themeOf(page)).toBe(scheme)

      // Still following: the system changing changes LorEvolve, until a choice is made.
      await page.emulateMedia({ colorScheme: scheme === 'light' ? 'dark' : 'light' })
      await expect.poll(() => themeOf(page)).toBe(scheme === 'light' ? 'dark' : 'light')
      await context.close()
    }
  })

  test('Dark chosen on the portal holds into the workspace, through reloads, a new window and signing out', async ({
    browser,
  }) => {
    const { context, page } = await fresh(browser, 'light')
    await page.goto('/explore')
    expect(await themeOf(page)).toBe('light')

    // Signed out, the choice is Appearance beside Log in; keyboard all the way.
    await page.getByTestId('portal-appearance').focus()
    await page.keyboard.press('Enter')
    const dark = page.getByTestId('theme-dark')
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true')
    await dark.focus()
    await page.keyboard.press('Enter')
    await expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(await themeOf(page)).toBe('dark')
    expect(luminance(await ground(page, '.portal'))).toBeLessThan(0.2)
    // The system no longer decides once a choice is made.
    await page.emulateMedia({ colorScheme: 'light' })
    expect(await themeOf(page)).toBe('dark')

    // Signing up (the login flow's sibling) keeps it, and so does the workspace.
    await signUp(page)
    expect(await themeOf(page)).toBe('dark')
    expect(luminance(await ground(page))).toBeLessThan(0.2)

    await page.reload()
    expect(await themeOf(page)).toBe('dark')

    // A second window of the same browser - what reopening it is.
    const again = await context.newPage()
    await again.goto('/app')
    expect(await themeOf(again)).toBe('dark')
    await again.close()

    // Signing out does not reset it.
    await page.getByTestId('account-menu-trigger').click()
    await page.getByTestId('account-menu-signout').click()
    await page.waitForURL('/login')
    expect(await themeOf(page)).toBe('dark')
    await context.close()
  })

  test('Light chosen in the workspace holds into the portal and back, and the portal keeps its own look', async ({
    browser,
  }) => {
    const { context, page } = await fresh(browser, 'dark')
    await signUp(page)
    const w = await world(page)
    expect(await themeOf(page)).toBe('dark')

    await page.getByTestId('account-menu-trigger').click()
    await page.getByTestId('theme-light').click()
    // The menu stays open, the choice is visible in it, and the whole app changed.
    await expect(page.getByTestId('theme-light')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'false')
    expect(await themeOf(page)).toBe('light')
    const workspaceGround = await ground(page)
    expect(luminance(workspaceGround)).toBeGreaterThan(0.6)

    // Workspace to portal.
    await page.goto('/explore')
    expect(await themeOf(page)).toBe('light')
    const portalGround = await ground(page, '.portal')
    expect(luminance(portalGround)).toBeGreaterThan(0.6)
    // Same theme, not the same product: the portal's ground is its own.
    expect(portalGround).not.toBe(workspaceGround)

    await page.goto(`/worlds/${w.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(w.name)
    const title = await page
      .getByRole('heading', { level: 1 })
      .evaluate((node) => getComputedStyle(node).color)
    expect(luminance(title)).toBeLessThan(0.1)

    // And back, and after a reload.
    await page.getByTestId('portal-workspace').click()
    await page.waitForURL('/app')
    expect(await themeOf(page)).toBe('light')
    await page.reload()
    expect(await themeOf(page)).toBe('light')

    // The Profile offers the same choice, and it is the same setting.
    await page.goto('/app/profile')
    await page.getByRole('region', { name: 'Appearance' }).getByTestId('theme-dark').click()
    expect(await themeOf(page)).toBe('dark')
    await page.goto('/explore')
    expect(luminance(await ground(page, '.portal'))).toBeLessThan(0.2)
    await context.close()
  })

  test('logging in from a public page keeps the theme and comes back to the page', async ({
    browser,
  }) => {
    const owner = await fresh(browser, 'light')
    const username = await signUp(owner.page)
    const w = await world(owner.page)
    await owner.context.close()

    const { context, page } = await fresh(browser, 'light')
    await page.addInitScript(() => localStorage.setItem('lorevolve-theme', 'dark'))
    await page.goto(`/worlds/${w.slug}`)
    expect(await themeOf(page)).toBe('dark')
    await page.getByTestId('portal-login').click()
    await page.waitForURL('/login')
    expect(await themeOf(page)).toBe('dark')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(`/worlds/${w.slug}`)
    expect(await themeOf(page)).toBe('dark')
    await context.close()
  })

  test('the theme is in place before the app draws, on a deep link, and never flips', async ({
    browser,
  }) => {
    const { context, page } = await fresh(browser, 'light')
    await page.addInitScript(() => localStorage.setItem('lorevolve-theme', 'dark'))
    // Record every theme <html> ever has, from the first parse of the document.
    await page.addInitScript(() => {
      const seen: (string | undefined)[] = []
      ;(window as unknown as { __themes: typeof seen }).__themes = seen
      // `<html>` does not exist yet when this runs, so watch the document for it.
      new MutationObserver(() => seen.push(document.documentElement?.dataset.theme)).observe(
        document,
        { subtree: true, attributes: true, attributeFilter: ['data-theme'] },
      )
    })
    await page.goto('/app/universes/00000000-0000-0000-0000-000000000000/lore')
    await page.waitForLoadState('networkidle')
    const seen = await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes)
    expect(seen.length).toBeGreaterThan(0)
    expect(new Set(seen)).toEqual(new Set(['dark']))
    // The browser's own chrome and controls follow too.
    expect(
      await page.evaluate(() =>
        document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      ),
    ).toBe('#151617')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'dark',
    )
    await context.close()
  })

  test('the installed app still starts at Explore, and the server head is untouched by the theme', async ({
    page,
  }) => {
    const manifest = await (await page.request.get('/manifest.webmanifest')).json()
    expect(manifest.start_url).toBe('/explore')
    expect(manifest.id).toBe('/app')

    await signUp(page)
    const w = await world(page)
    const html = await (await page.request.get(`${API}/worlds/${w.slug}`)).text()
    expect(html).toContain(`<title>${w.name} | LorEvolve</title>`)
    expect(html).toContain(`<link rel="canonical" href="http://localhost:5173/worlds/${w.slug}" />`)
    expect(html).toContain('<meta name="robots" content="index,follow" />')
    // The bootstrap is in the shell once, outside the per-page head, and no address carries a theme.
    expect(html.match(/lorevolve-theme/g)?.length).toBe(1)
    const head = html.slice(
      html.indexOf('<!-- lorevolve:head -->'),
      html.indexOf('<!-- /lorevolve:head -->'),
    )
    expect(head).not.toMatch(/data-theme|lorevolve-theme|color-scheme/)
    const map = await (await page.request.get('/sitemap.xml')).text()
    expect(map).not.toMatch(/[?&]theme=/)
  })

  test('both themes reflow on the narrowest phones and at 200% zoom', async ({ browser }) => {
    // 36-odd navigations plus a sign-up and a picture upload: ~25 s here, past Playwright's default 30 s on a CI
    // runner (Deploy DEV #53 timed out on all three attempts with every page rendering in ~0.4 s). The loop is the
    // test; its budget says so.
    test.setTimeout(120_000)
    const setup = await browser.newContext()
    const owner = await setup.newPage()
    await signUp(owner)
    const w = await world(owner)
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
        for (const path of [
          '/explore',
          `/worlds/${w.slug}`,
          '/app',
          `/app/universes/${w.id}/lore`,
          `/app/universes/${w.id}/settings`,
          '/app/profile',
        ]) {
          await page.goto(path)
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
          expect(await themeOf(page)).toBe(theme)
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, `${theme} ${size.width} ${path}`).toBeLessThanOrEqual(0)
        }
        await context.close()
      }
    }
  })
})
