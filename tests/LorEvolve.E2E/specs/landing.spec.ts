import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { expectedVersionLabel, makeTestPassword } from './support/account'
import { png } from './support/png'

/**
 * Product refinement 031: LorEvolve's home. `/` is a page of the portal - no longer a redirect to Explore - that says what
 * LorEvolve is and offers one way on: into the workspace (signed in) or into an account (signed out), with Explore beside
 * it. The brand leads here from every shell; Explore stays a named destination of its own, on every width.
 *
 * The home page's preview of published worlds reads the same public listing Explore reads, and the suite's database is
 * shared by every spec running at once, so the preview is checked against the response the page itself received rather
 * than against a world this test hopes is still the newest. The empty and failed states are the API's answers, stood in
 * for by the browser, because no test can make a shared database have no public worlds.
 */
const PASSWORD = makeTestPassword()
const HOME_TITLE = 'LorEvolve | Build connected fictional universes'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(request: APIRequestContext) {
  const username = unique('lander')
  const response = await request.post('/api/auth/register', {
    data: { username, email: `${username}@example.test`, password: PASSWORD },
  })
  expect(response.ok()).toBe(true)
  return username
}

async function stranger(browser: Browser, width = 1280, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } })
  return { context, page: await context.newPage() }
}

/** A published world of this test's own, so a public page exists to walk from. Returns its slug. */
async function publishedWorld(page: Page) {
  await page.request.put('/api/profile/public-name', { data: { publicDisplayName: 'Odile Brae' } })
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Landing Shore '), description: null },
  })
  expect(created.ok()).toBe(true)
  const { id } = (await created.json()) as { id: string }
  expect(
    (
      await page.request.put(`/api/universes/${id}/publication`, {
        data: { publicSummary: 'A world shared for the home page.', category: 1, genres: [1] },
      })
    ).ok(),
  ).toBe(true)
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: {
        name: 'art.png',
        mimeType: 'image/png',
        buffer: png(800, 500, (x) => (x < 400 ? [60, 90, 160] : [200, 150, 90])),
      },
    },
  })
  expect(artwork.ok()).toBe(true)
  const published = await page.request.post(`/api/universes/${id}/publish`)
  expect(published.ok()).toBe(true)
  return ((await published.json()) as { publicSlug: string }).publicSlug
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('LorEvolve’s home is /', () => {
  test('signed out: a page, not a redirect, with one h1, its landmarks, its title and no world search', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    await expect(page).toHaveTitle(HOME_TITLE)

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Build the world. Tell the story. Whatever form it takes.',
    )
    await expect(page.getByText('A workspace for fictional universes').first()).toBeVisible()
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Hold a whole universe, not one long document.',
      'Everything in it is connected.',
      'Write the story inside the world.',
      'Read the worlds others have shared.',
      'Your world stays yours.',
      'Every universe starts with a name.',
    ])

    // The bar: brand, Explore, the way in - and no search box asking a newcomer a question first.
    await expect(page.getByTestId('explore-search')).toHaveCount(0)
    await expect(page.getByRole('search')).toHaveCount(0)
    await expect(page.getByTestId('portal-explore')).toHaveText('Explore')
    await expect(page.getByTestId('portal-explore')).not.toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('portal-login')).toBeVisible()
    await expect(page.getByTestId('portal-join')).toHaveText('Create account')
    await expect(page.getByTestId('portal-appearance')).toBeVisible()
    await expect(page.getByTestId('portal-workspace')).toHaveCount(0)

    // The painting is decoration, and no workspace is pictured: the only other pictures are public worlds' cards.
    await expect(page.locator('.landing-hero__image')).toHaveAttribute('alt', '')
    await expect(page.getByTestId('landing-shot')).toHaveCount(0)
    await expect(
      page.locator('.landing img:not(.landing-hero__image):not(.worldcard__image)'),
    ).toHaveCount(0)

    // Nothing the page does not offer: no prices, trials or artificial intelligence.
    const text = (await page.getByTestId('landing').innerText()).toLowerCase()
    for (const word of [
      'free trial',
      'pricing',
      'per month',
      'credit card',
      ' ai ',
      'ai-powered',
      '—',
    ]) {
      expect(text, word).not.toContain(word)
    }
    await context.close()
  })

  test('signed out: the footer offers only real places, this year and the running version', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.goto('/')
    const footer = page.getByTestId('portal-footer')
    await expect(footer).toBeVisible()
    expect(await footer.evaluate((node) => node.tagName)).toBe('FOOTER')

    // The brand goes home; the one group of links goes somewhere real, each of them.
    await expect(footer.getByRole('link', { name: 'LorEvolve – Home' })).toHaveAttribute(
      'href',
      '/',
    )
    const product = footer.getByRole('navigation', { name: 'Product' })
    await expect(product.getByRole('link')).toHaveText(['Explore', 'Create account', 'Log in'])
    for (const [name, href] of [
      ['Explore', '/explore'],
      ['Create account', '/register'],
      ['Log in', '/login'],
    ]) {
      await expect(product.getByRole('link', { name })).toHaveAttribute('href', href)
    }

    // Nothing LorEvolve does not have: no community, no legal pages, no icon links to anywhere else.
    await expect(footer.getByRole('navigation')).toHaveCount(1)
    await expect(footer.getByText(/community|privacy|terms|contact|support/i)).toHaveCount(0)
    await expect(footer.locator('a[href^="http"], a[target="_blank"], svg')).toHaveCount(0)

    // The year is the visitor's, and the version is the build's, written down nowhere else.
    await expect(page.getByTestId('portal-footer-copyright')).toHaveText(
      `© ${new Date().getFullYear()} LorEvolve`,
    )
    const version = page.getByTestId('portal-footer-version')
    await expect(version).toHaveText(expectedVersionLabel())
    await expect(version.locator('a')).toHaveCount(0)

    // The home page's footer only: Explore keeps none.
    await page.goto('/explore')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
    await expect(page.getByTestId('portal-footer')).toHaveCount(0)
    await context.close()
  })

  test('signed out: Start building opens registration, which then lands in the workspace; Explore worlds opens Explore', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser)
    await page.goto('/')
    const primary = page.getByTestId('landing-primary')
    await expect(primary).toHaveText('Start building')
    await expect(page.getByTestId('landing-final-actions').getByRole('link')).toHaveText([
      'Start building your universe',
      'Log in',
    ])

    await page.getByTestId('landing-explore').click()
    await page.waitForURL('/explore')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
    await expect(page.getByTestId('explore-search')).toBeVisible()

    await page.goto('/')
    await primary.click()
    await page.waitForURL('/register')
    const username = unique('builder')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.test`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    // "Start building" means start: the workspace, not back to the page that offered it.
    await page.waitForURL('/app')
    await context.close()
  })

  test('signed in: the workspace is the way on, in the bar, the hero and the last word; no Log in or Create account', async ({
    page,
  }) => {
    await account(page.request)
    await page.goto('/')
    await expect(page.getByTestId('portal-workspace')).toHaveText('My workspace')
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible()
    await expect(page.getByTestId('portal-login')).toHaveCount(0)
    await expect(page.getByTestId('portal-join')).toHaveCount(0)
    await expect(page.getByTestId('portal-appearance')).toHaveCount(0)

    await expect(page.getByTestId('landing-primary')).toHaveText('Go to my workspace')
    await expect(page.getByTestId('landing-explore')).toHaveText('Explore worlds')
    await expect(page.getByTestId('landing-final-actions').getByRole('link')).toHaveText([
      'Open my workspace',
    ])
    await expect(page.getByTestId('portal-footer-links').getByRole('link')).toHaveText([
      'Explore',
      'My workspace',
    ])
    // The version a signed-in visitor sees here is the one their account menu shows.
    await expect(page.getByTestId('portal-footer-version')).toHaveText(expectedVersionLabel())
    await page.getByTestId('account-menu-trigger').click()
    await expect(page.getByTestId('account-menu-version')).toHaveText(
      (await page.getByTestId('portal-footer-version').textContent())!,
    )
    await page.keyboard.press('Escape')
    await expect(page.getByText('Start building')).toHaveCount(0)

    await page.getByTestId('landing-primary').click()
    await page.waitForURL('/app')

    // The account menu works here too, and signing out from the home page stays on it.
    await page.goto('/')
    await page.getByTestId('account-menu-trigger').click()
    await expect(page.getByTestId('account-menu-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByTestId('portal-login')).toBeVisible()
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('landing-primary')).toHaveText('Start building')
  })

  test('Log in from the home page lands in the workspace rather than back on the page that offered it', async ({
    page,
    request,
  }) => {
    const username = await account(request)
    await page.goto('/')
    await page.getByTestId('portal-login').click()
    await page.waitForURL('/login')
    await page.getByLabel('Username or email').fill(username)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/app')
  })
})

test.describe('The brand leads home, and Explore stays its own place', () => {
  test('from Explore and a public world the brand goes home; Explore is a named link back, current on Explore', async ({
    page,
    browser,
  }) => {
    await account(page.request)
    const slug = await publishedWorld(page)

    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/worlds/${slug}`)
    await expect(visitor.getByTestId('public-world')).toBeVisible()
    const brand = visitor.getByRole('link', { name: 'LorEvolve – Home' })
    await expect(brand).toHaveAttribute('href', '/')
    await brand.click()
    await visitor.waitForURL('/')
    await expect(visitor.getByTestId('landing')).toBeVisible()

    await visitor.getByTestId('portal-explore').click()
    await visitor.waitForURL('/explore')
    await expect(visitor.getByTestId('portal-explore')).toHaveAttribute('aria-current', 'page')
    await visitor.getByRole('link', { name: 'LorEvolve – Home' }).click()
    await visitor.waitForURL('/')

    // An address nobody holds, outside the workspace, is the home page.
    await visitor.goto('/no-such-page/at-all')
    await visitor.waitForURL('/')
    await expect(visitor.getByTestId('landing')).toBeVisible()
    await context.close()
  })
})

test.describe('The home page points to Explore for published worlds', () => {
  test('no world cards and no listing request: a line about published worlds and the link to Explore', async ({
    page,
    browser,
  }) => {
    // A public world exists, so a card would have something to show if the page still drew them.
    await account(page.request)
    await publishedWorld(page)

    const { context, page: visitor } = await stranger(browser, 1440)
    const listings: string[] = []
    visitor.on('request', (request) => {
      if (request.url().includes('/api/public/universes')) listings.push(request.url())
    })
    await visitor.goto('/')
    const section = visitor.locator('.landing-explore')
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(
      'Read the worlds others have shared.',
    )
    await expect(section.locator('.landing-lede')).toContainText('Anyone can read them in Explore')
    await expect(visitor.locator('.landing .worldcard')).toHaveCount(0)
    await expect(visitor.getByTestId('landing-explore-all')).toHaveText('Explore all worlds')
    expect(listings).toEqual([])

    await visitor.getByTestId('landing-explore-all').click()
    await visitor.waitForURL('/explore')
    await context.close()
  })
})

test.describe('Every width, both themes', () => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [820, 1180],
    [640, 900],
    [414, 896],
    [390, 844],
    [360, 780],
  ] as const) {
    test(`${width}px: three-line title, the way in, Explore in the bar, nothing sideways`, async ({
      browser,
    }) => {
      const { context, page } = await stranger(browser, width, height)
      await page.goto('/')
      await expect(page.getByTestId('landing-primary')).toBeVisible()
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      // Each sentence of the title is one line of its own, at every width.
      const lines = await page
        .getByRole('heading', { level: 1 })
        .evaluate((heading) =>
          [...heading.querySelectorAll('span')].map((span) => span.getClientRects().length),
        )
      expect(lines).toEqual([1, 1, 1])

      // The four numbers: one row from a tablet up, two by two below it, never four stacked rows.
      const tops = await page
        .getByTestId('landing-metrics')
        .locator('.landing-metric')
        .evaluateAll((metrics) =>
          metrics.map((metric) => Math.round(metric.getBoundingClientRect().top)),
        )
      expect(tops).toHaveLength(4)
      expect(new Set(tops).size).toBe(width >= 768 ? 1 : 2)

      // The bar keeps brand, Explore, Appearance and both ways in reachable, and nothing in it touches: the brand keeps
      // at least the session's own margin of air (--space-2) whatever faces the platform has.
      for (const id of ['portal-explore', 'portal-appearance', 'portal-login', 'portal-join']) {
        await expect(page.getByTestId(id)).toBeVisible()
      }
      const brand = (await page.locator('.portal__brand').boundingBox())!
      const session = (await page.getByTestId('portal-session').boundingBox())!
      expect(session.x - (brand.x + brand.width)).toBeGreaterThanOrEqual(8)
      expect(session.x + session.width).toBeLessThanOrEqual(width)

      // The two hero actions keep one line each.
      for (const id of ['landing-primary', 'landing-explore']) {
        const box = (await page.getByTestId(id).boundingBox())!
        expect(box.height, id).toBeLessThan(56)
      }
      await page.getByTestId('portal-footer').scrollIntoViewIfNeeded()
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      // The footer keeps the page's gutters and lines up with the sections above it, its version inside them.
      const section = (await page.locator('.landing-section').first().boundingBox())!
      const footer = (await page.getByTestId('portal-footer').boundingBox())!
      expect(footer.x).toBeGreaterThanOrEqual(16)
      expect(Math.abs(footer.x - section.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(footer.width - section.width)).toBeLessThanOrEqual(1)
      const version = (await page.getByTestId('portal-footer-version').boundingBox())!
      expect(version.x).toBeGreaterThanOrEqual(footer.x)
      expect(version.x + version.width).toBeLessThanOrEqual(footer.x + footer.width + 1)
      await context.close()
    })
  }

  test('Appearance turns the home page light, with graphite type on the parchment veil', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1440)
    await page.addInitScript(() => localStorage.setItem('lorevolve-theme', 'dark'))
    await page.goto('/')
    await page.getByTestId('portal-appearance').click()
    await page.getByTestId('theme-light').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const ink = await page
      .getByRole('heading', { level: 1 })
      .evaluate((heading) => getComputedStyle(heading).color)
    expect(ink).toBe('rgb(31, 28, 24)')
    await context.close()
  })

  test('the keyboard reaches the bar and the hero actions in order, with a visible ring', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1280)
    await page.goto('/')
    await expect(page.getByTestId('landing-primary')).toBeVisible()
    const order: string[] = []
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab')
      order.push(
        await page.evaluate(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ??
            document.activeElement?.textContent?.trim() ??
            '',
        ),
      )
    }
    expect(order.indexOf('portal-explore')).toBeGreaterThan(-1)
    expect(order.indexOf('landing-primary')).toBeGreaterThan(order.indexOf('portal-join'))
    expect(order.indexOf('landing-explore')).toBe(order.indexOf('landing-primary') + 1)

    await page.getByTestId('landing-primary').focus()
    const outline = await page
      .getByTestId('landing-primary')
      .evaluate((link) => getComputedStyle(link).outlineStyle)
    expect(outline).toBe('solid')
    await context.close()
  })
})

test.describe('LorEvolve in numbers', () => {
  const metric = (page: Page, key: string) => page.getByTestId(`landing-metric-${key}`)
  const KEYS = ['creators', 'universes', 'publishedWorlds', 'privateWorlds'] as const

  async function shown(page: Page) {
    return Promise.all(KEYS.map((key) => metric(page, key).innerText()))
  }

  test('the four live counts are the API’s, the same signed out and signed in', async ({
    page,
    browser,
  }) => {
    await account(page.request)

    const { context, page: visitor } = await stranger(browser, 1280)
    const answered = visitor.waitForResponse((response) =>
      response.url().endsWith('/api/public/stats'),
    )
    await visitor.goto('/')
    const stats = (await (await answered).json()) as Record<(typeof KEYS)[number], number>
    const expected = KEYS.map((key) => new Intl.NumberFormat('en').format(stats[key]))
    await expect(metric(visitor, 'privateWorlds')).not.toBeEmpty()
    expect(await shown(visitor)).toEqual(expected)
    await expect(visitor.getByTestId('landing-metrics').locator('dt')).toHaveText([
      'Creators',
      'Universes',
      'Published worlds',
      'Private worlds',
    ])
    expect(stats.universes).toBe(stats.publishedWorlds + stats.privateWorlds)
    await context.close()

    // Signed in: the same global numbers, not this account's.
    const signedIn = page.waitForResponse((response) =>
      response.url().endsWith('/api/public/stats'),
    )
    await page.goto('/')
    const again = (await (await signedIn).json()) as Record<string, number>
    await expect(metric(page, 'privateWorlds')).not.toBeEmpty()
    expect(await shown(page)).toEqual(
      KEYS.map((key) => new Intl.NumberFormat('en').format(again[key])),
    )
    expect(again.creators).toBeGreaterThanOrEqual(stats.creators)
  })

  test('whatever the API says is what is shown: zeros as zeros, large numbers in full', async ({
    browser,
  }) => {
    for (const [answer, words] of [
      [{ creators: 0, universes: 0, publishedWorlds: 0, privateWorlds: 0 }, ['0', '0', '0', '0']],
      [
        { creators: 1284, universes: 12500, publishedWorlds: 7, privateWorlds: 12493 },
        ['1,284', '12,500', '7', '12,493'],
      ],
    ] as const) {
      const { context, page } = await stranger(browser, 1280)
      await page.route('**/api/public/stats', (route) => route.fulfill({ json: answer }))
      await page.goto('/')
      await expect(metric(page, 'creators')).toHaveText(words[0])
      expect(await shown(page)).toEqual(words)
      await context.close()
    }
  })

  test('while the numbers load nothing says 0, and the row already holds its place', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1280)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/public/stats', async (route) => {
      await held
      await route.fulfill({
        json: { creators: 5, universes: 9, publishedWorlds: 2, privateWorlds: 7 },
      })
    })
    await page.goto('/')
    await expect(page.getByTestId('landing-metrics').locator('dt')).toHaveCount(4)
    expect(await shown(page)).toEqual(['', '', '', ''])
    const before = (await page.getByTestId('landing-metrics').boundingBox())!.height
    release()
    await expect(metric(page, 'creators')).toHaveText('5')
    const after = (await page.getByTestId('landing-metrics').boundingBox())!.height
    expect(Math.abs(after - before)).toBeLessThan(2)
    await context.close()
  })

  test('numbers that cannot be read leave quietly, and the page still works', async ({
    browser,
  }) => {
    const { context, page } = await stranger(browser, 1280)
    await page.route('**/api/public/stats', (route) => route.abort())
    await page.goto('/')
    await expect(page.getByTestId('landing-primary')).toHaveText('Start building')
    await expect(page.getByTestId('landing-metrics')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
      'Hold a whole universe, not one long document.',
    )
    await context.close()
  })
})
