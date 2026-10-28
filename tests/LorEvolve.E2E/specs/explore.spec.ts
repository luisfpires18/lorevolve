import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Public portal 009: Explore Worlds. What the API promises about filtering, search, sort and privacy is settled by
 * `PublicExploreQueryTests`; what only a browser can show is here - the portal's own header signed in and out, the
 * bridge to the workspace and back, real cards that open their world, discovery kept in the address through Back,
 * Forward and a refresh, "Show more worlds", the empty, no-match and error states, a phone's width, the keyboard,
 * and names that read right to left.
 *
 * The suite's database is shared by every spec running at once, so each test publishes worlds carrying a word of
 * its own and searches for it: everything asserted is inside that search, and nothing depends on who else has
 * published. Accounts are made through the API; a signed-out visitor is a browser context with no session.
 */
const PASSWORD = 'Test-password-123!'
const FANTASY = 1
const SCIENCE_FICTION = 2
const HORROR = 8
const MYSTERY = 16
const GAMES = 3
const BOOKS = 4
const ORIGINAL = 1

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** A search word no other test uses: letters only, so it is one word to the search and to a slug. */
function token() {
  return unique('q').replace(/[0-9]/g, (digit) => 'abcdefghij'[Number(digit)])
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

/** An account, signed in on `page`'s context, publishing under `author`. */
async function author(page: Page, name: string) {
  const username = unique('explorer')
  const response = await page.request.post('/api/auth/register', {
    data: { username, email: `${username}@example.test`, password: PASSWORD },
  })
  expect(response.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: name })
}

interface World {
  name: string
  category: number
  genres: number[]
  summary?: string
  publish?: boolean
}

/** A universe with everything publishing needs - published, unless told otherwise. Returns its slug. */
async function world(page: Page, { name, category, genres, summary, publish = true }: World) {
  const { id } = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: null,
  }))!
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: summary ?? 'A world its author chose to share.',
    category,
    genres,
  })
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
  if (!publish) return null
  const state = (await api<{ publicSlug: string }>(page, 'POST', `/api/universes/${id}/publish`))!
  return state.publicSlug
}

async function stranger(browser: Browser, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  return { context, page: await context.newPage() }
}

function cards(page: Page) {
  return page.getByTestId('explore-list').locator('.worldcard__name')
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('Explore worlds', () => {
  test('signed out: the portal header, real cards only, and a card opens its world', async ({
    page,
    browser,
  }) => {
    const word = token()
    await author(page, 'Mara Vell')
    const slug = await world(page, {
      name: `${word} Hollowmere`,
      category: GAMES,
      genres: [FANTASY, HORROR],
    })
    await world(page, { name: `${word} Saltglass`, category: BOOKS, genres: [MYSTERY] })
    await world(page, {
      name: `${word} Unpublished`,
      category: GAMES,
      genres: [FANTASY],
      publish: false,
    })

    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/explore?q=${word}`)

    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveCount(1)
    const session = visitor.getByTestId('portal-session')
    await expect(session.getByRole('link', { name: 'Log in' })).toBeVisible()
    await expect(session.getByRole('link', { name: 'Create account' })).toBeVisible()
    await expect(visitor.getByTestId('portal-workspace')).toHaveCount(0)
    await expect(
      visitor.getByRole('navigation', { name: 'Explore' }).getByRole('link', { name: 'Explore' }),
    ).toHaveAttribute('aria-current', 'page')

    // Only what was published, each as one card: artwork, name, what it is, and who made it.
    await expect(cards(visitor)).toHaveText([`${word} Saltglass`, `${word} Hollowmere`])
    await expect(visitor.getByTestId('explore-count')).toHaveText('2 worlds match')
    const card = visitor.locator('.worldcard').filter({ hasText: `${word} Hollowmere` })
    // Genres as chips, and the category beside the author.
    await expect(card.locator('.genrechip')).toHaveText(['Fantasy', 'Horror'])
    await expect(card.locator('.worldcard__category')).toHaveText('Games')
    await expect(card).toContainText('by Mara Vell')
    await expect(card).not.toContainText('Unpublished')
    await expect
      .poll(() => card.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    // Two links, never nested (Task 011): the world by its name - stretched over the card - and its author.
    const worldLink = card.getByRole('link', { name: `${word} Hollowmere` })
    await expect(card.getByRole('link')).toHaveCount(2)
    await expect(card.getByTestId('worldcard-author')).toHaveText('Mara Vell')
    await expect(card.locator('a a, a button, button, input, select')).toHaveCount(0)

    // The picture is part of the world's link.
    await card.locator('.worldcard__panel').click({ position: { x: 40, y: 40 } })
    await visitor.waitForURL(`/worlds/${slug}`)
    await visitor.goBack()
    await worldLink.click()
    await visitor.waitForURL(`/worlds/${slug}`)
    await expect(visitor.getByTestId('public-world').getByRole('heading', { level: 1 })).toHaveText(
      `${word} Hollowmere`,
    )
    await context.close()
  })

  test('signed in: My workspace and Explore lead across and back', async ({ page }) => {
    await author(page, 'Iris Hale')
    await page.goto('/explore')

    const workspace = page.getByTestId('portal-workspace')
    await expect(workspace).toHaveText('My workspace')
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible()
    await expect(
      page.getByTestId('portal-session').getByRole('link', { name: 'Log in' }),
    ).toHaveCount(0)

    await workspace.click()
    await page.waitForURL('/app')
    await page.getByTestId('home-explore').click()
    await page.waitForURL('/explore')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
  })

  test('category, genre, search and sort compose in the address, and Back, Forward and refresh restore them', async ({
    page,
  }) => {
    const word = token()
    const writer = `Author ${word}`
    await author(page, writer)
    await world(page, { name: `${word} Alder`, category: GAMES, genres: [FANTASY] })
    await world(page, { name: `${word} birch`, category: BOOKS, genres: [FANTASY, HORROR] })
    await world(page, {
      name: `${word} Cedar`,
      category: GAMES,
      genres: [SCIENCE_FICTION],
      summary: `Starships over glass seas, ${word}sum.`,
    })

    await page.goto('/explore')
    const search = page.getByTestId('explore-search')
    await search.fill(word)
    await page.waitForURL(`/explore?q=${word}`)
    await expect(cards(page)).toHaveText([`${word} Cedar`, `${word} birch`, `${word} Alder`])

    await page.getByTestId('explore-category-games').click()
    await page.waitForURL(`/explore?q=${word}&category=games`)
    await expect(page.getByTestId('explore-category-games')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByTestId('explore-category-all')).not.toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(cards(page)).toHaveText([`${word} Cedar`, `${word} Alder`])

    await page.getByTestId('explore-genre').selectOption({ label: 'Fantasy' })
    await page.waitForURL(`/explore?q=${word}&category=games&genre=fantasy`)
    await expect(cards(page)).toHaveText([`${word} Alder`])

    await page.goBack()
    await page.waitForURL(`/explore?q=${word}&category=games`)
    await expect(page.getByTestId('explore-genre')).toHaveValue('')
    await expect(cards(page)).toHaveText([`${word} Cedar`, `${word} Alder`])
    await page.goBack()
    await page.waitForURL(`/explore?q=${word}`)
    await expect(cards(page)).toHaveCount(3)
    await page.goForward()
    await page.waitForURL(`/explore?q=${word}&category=games`)
    await expect(cards(page)).toHaveCount(2)

    await page.getByTestId('explore-sort').selectOption('az')
    await page.waitForURL(`/explore?q=${word}&category=games&sort=az`)
    await expect(cards(page)).toHaveText([`${word} Alder`, `${word} Cedar`])

    await page.reload()
    await expect(search).toHaveValue(word)
    await expect(page.getByTestId('explore-sort')).toHaveValue('az')
    await expect(page.getByTestId('explore-category-games')).toHaveAttribute('aria-current', 'true')
    await expect(cards(page)).toHaveText([`${word} Alder`, `${word} Cedar`])

    // "All" drops the category and keeps the rest.
    await page.getByTestId('explore-category-all').click()
    await page.waitForURL(`/explore?q=${word}&sort=az`)
    await expect(cards(page)).toHaveText([`${word} Alder`, `${word} birch`, `${word} Cedar`])

    // The public summary and the author's public name are searched too.
    await search.fill(`${word}sum`)
    await page.waitForURL(`/explore?q=${word}sum&sort=az`)
    await expect(cards(page)).toHaveText([`${word} Cedar`])
    await search.fill(writer)
    await page.waitForURL(new RegExp(`q=Author\\+${word}`))
    await expect(cards(page)).toHaveCount(3)

    // Clearing is immediate, and the address forgets the search.
    await page.getByTestId('explore-search-clear').click()
    await page.waitForURL('/explore?sort=az')
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
  })

  test('no match says so and clears; an API failure is an error with a way back, not an empty platform', async ({
    page,
  }) => {
    const word = token()
    await page.goto(`/explore?q=${word}&genre=horror`)
    await expect(page.getByTestId('explore-no-match')).toContainText('No published worlds match.')
    await expect(page.getByTestId('explore-empty')).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear search and filters' }).click()
    await page.waitForURL('/explore')
    await expect(page.getByTestId('explore-search')).toHaveValue('')

    // A failing API is not "no worlds".
    await page.route('**/api/public/universes?*', (route) =>
      route.fulfill({ status: 500, body: '' }),
    )
    await page.reload()
    await expect(page.getByTestId('explore-error')).toContainText('could not be loaded')
    await expect(page.getByTestId('explore-empty')).toHaveCount(0)
    await page.unroute('**/api/public/universes?*')
    await page.getByTestId('explore-error').getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('explore-error')).toHaveCount(0)
    await expect(page.getByTestId('explore-count')).not.toHaveText('Finding worlds…')

    // A platform where nobody has published anything yet: said plainly, with nothing invented.
    await page.route('**/api/public/universes?*', (route) =>
      route.fulfill({ json: { items: [], page: 1, pageSize: 24, totalCount: 0, totalPages: 0 } }),
    )
    await page.reload()
    await expect(page.getByTestId('explore-empty')).toContainText(
      'No worlds have been published yet.',
    )
    await expect(page.getByTestId('explore-list')).toHaveCount(0)
  })

  test('Show more worlds adds the next page, keeps the filters and repeats nothing', async ({
    page,
  }) => {
    const word = token()
    await author(page, 'Oren Vale')
    for (const name of ['Ash', 'Birch', 'Cedar']) {
      await world(page, { name: `${word} ${name}`, category: ORIGINAL, genres: [FANTASY] })
    }

    // Pages of two, so three worlds make two pages without publishing twenty-five.
    const asked: string[] = []
    await page.route('**/api/public/universes?*', (route) => {
      const url = new URL(route.request().url())
      url.searchParams.set('pageSize', '2')
      asked.push(url.search)
      return route.continue({ url: url.toString() })
    })

    await page.goto(`/explore?q=${word}&category=original`)
    await expect(cards(page)).toHaveText([`${word} Cedar`, `${word} Birch`])
    await expect(page.getByTestId('explore-count')).toHaveText('Showing 2 of 3 worlds')
    await page.getByTestId('explore-more').click()
    await expect(cards(page)).toHaveText([`${word} Cedar`, `${word} Birch`, `${word} Ash`])
    await expect(page.getByTestId('explore-count')).toHaveText('3 worlds match')
    await expect(page.getByTestId('explore-more')).toHaveCount(0)
    expect(asked.at(-1)).toContain('page=2')
    expect(asked.at(-1)).toContain('category=original')
    expect(asked.at(-1)).toContain(`q=${word}`)

    // A new filter starts from the first page again.
    await page.getByTestId('explore-genre').selectOption('fantasy')
    await expect(cards(page)).toHaveCount(2)
    await expect(page.getByTestId('explore-more')).toBeVisible()
  })

  test('on a phone: the header, categories, genre and sort all work, by touch and by keyboard, with nothing sideways', async ({
    page,
    browser,
  }) => {
    const word = token()
    await author(page, 'Tamsin Rook')
    await world(page, { name: `${word} Wren`, category: GAMES, genres: [SCIENCE_FICTION] })

    for (const width of [390, 360]) {
      const { context, page: visitor } = await stranger(browser, width)
      await visitor.goto(`/explore?q=${word}`)
      await expect(cards(visitor)).toHaveText([`${word} Wren`])
      await expect(
        visitor.getByTestId('portal-session').getByRole('link', { name: 'Create account' }),
      ).toBeVisible()
      await noSidewaysScroll(visitor)

      // The last category is off the edge of its strip; choosing it scrolls the strip, never the page.
      await visitor.getByTestId('explore-category-other').click()
      await visitor.waitForURL(`/explore?q=${word}&category=other`)
      await expect(visitor.getByTestId('explore-no-match')).toBeVisible()
      await noSidewaysScroll(visitor)

      // The keyboard moves between categories and chooses one with Enter.
      await visitor.getByTestId('explore-category-books').focus()
      await visitor.keyboard.press('Shift+Tab')
      await expect(visitor.getByTestId('explore-category-games')).toBeFocused()
      await visitor.keyboard.press('Enter')
      await visitor.waitForURL(`/explore?q=${word}&category=games`)
      await expect(cards(visitor)).toHaveText([`${word} Wren`])

      await visitor.getByTestId('explore-genre').selectOption('science-fiction')
      await visitor.waitForURL(`/explore?q=${word}&category=games&genre=science-fiction`)
      await expect(cards(visitor)).toHaveText([`${word} Wren`])
      const target = await visitor.getByTestId('explore-genre').boundingBox()
      expect(target!.height).toBeGreaterThanOrEqual(40)
      await noSidewaysScroll(visitor)
      await context.close()
    }
  })

  test('right to left: names and authors read in their own direction and the portal does not flip', async ({
    page,
    browser,
  }) => {
    const word = token()
    const name = `آكرون — 12 / Wright ${word}`
    await author(page, 'مارا فيل')
    await world(page, {
      name,
      category: ORIGINAL,
      genres: [MYSTERY],
      summary: 'עיר שקועה, 12 שערים (וגשר אחד).',
    })
    await world(page, {
      name: `ירושלים של אש ${word}`,
      category: BOOKS,
      genres: [FANTASY, HORROR, MYSTERY],
    })

    const { context, page: visitor } = await stranger(browser, 390)
    await visitor.goto(`/explore?q=${word}&sort=az`)
    const titles = cards(visitor)
    // Code point order, case aside: Hebrew letters come before Arabic ones.
    await expect(titles.locator('bdi')).toHaveText([`ירושלים של אש ${word}`, name])
    await expect(titles.first()).toHaveAttribute('dir', 'auto')
    await expect(
      visitor.getByTestId('explore-list').locator('.worldcard__author bdi').first(),
    ).toHaveText('مارا فيل')
    const hebrew = visitor.getByTestId('explore-list').locator('.worldcard').first()
    await expect(hebrew.locator('.genrechip')).toHaveText(['Fantasy', 'Horror', 'Mystery'])
    await expect(hebrew.locator('.worldcard__category')).toHaveText('Books')

    // One authored title does not turn the portal around.
    expect(
      await visitor.evaluate(
        () => getComputedStyle(document.querySelector('.explore-filters')!).direction,
      ),
    ).toBe('ltr')
    expect(await visitor.evaluate(() => document.documentElement.dir)).not.toBe('rtl')

    // A search in another script finds it, by its public summary.
    await visitor.getByTestId('explore-search').fill('שערים')
    await visitor.waitForURL(/q=/)
    await expect(titles.locator('bdi').filter({ hasText: name })).toHaveCount(1)
    await noSidewaysScroll(visitor)
    await context.close()
  })

  test('a card whose picture cannot be shown keeps its shape and borrows no artwork', async ({
    page,
    browser,
  }) => {
    const word = token()
    await author(page, 'Nell Quarry')
    await world(page, { name: `${word} Lost Picture`, category: GAMES, genres: [FANTASY] })

    const { context, page: visitor } = await stranger(browser)
    await visitor.route('**/artwork/card/**', (route) => route.fulfill({ status: 404, body: '' }))
    await visitor.goto(`/explore?q=${word}`)
    const card = visitor.getByTestId('explore-list').locator('.worldcard').first()
    await expect(card.getByTestId('worldcard-fallback')).toBeVisible()
    await expect(card.locator('.worldcard__name')).toHaveText(`${word} Lost Picture`)
    const art = await card.locator('.worldcard__art').boundingBox()
    expect(Math.round((art!.width / art!.height) * 10) / 10).toBe(1.6)
    await context.close()
  })
})

/** An account made through the API, outside any page, so a test can then log in with it the way a visitor does. */
async function account(request: APIRequestContext) {
  const username = unique('visitor')
  const response = await request.post('/api/auth/register', {
    data: { username, email: `${username}@example.test`, password: PASSWORD },
  })
  expect(response.ok()).toBe(true)
  return username
}

async function logInOnPage(page: Page, username: string) {
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('the portal is the front door', () => {
  test('anyone reaches Explore and a public world directly, from the home page, after a refresh and in a new session', async ({
    page,
    browser,
  }) => {
    const word = token()
    await author(page, 'Ada Quill')
    const slug = await world(page, {
      name: `${word} Open Door`,
      category: GAMES,
      genres: [FANTASY],
    })

    // From LorEvolve's home (031), Explore is one named link away.
    const { context, page: visitor } = await stranger(browser)
    await visitor.goto('/')
    await visitor.getByTestId('portal-explore').click()
    await visitor.waitForURL('/explore')
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
    await visitor.reload()
    await expect(visitor).toHaveURL(/\/explore$/)
    await expect(visitor.getByTestId('portal-login')).toBeVisible()
    await context.close()

    // The address pasted into a browser with no session at all, then refreshed.
    const fresh = await stranger(browser)
    await fresh.page.goto(`/worlds/${slug}`)
    await expect(
      fresh.page.getByTestId('public-world').getByRole('heading', { level: 1 }),
    ).toHaveText(`${word} Open Door`)
    await fresh.page.reload()
    await expect(fresh.page).toHaveURL(new RegExp(`/worlds/${slug}$`))
    await expect(fresh.page.getByTestId('public-world')).toBeVisible()

    // The bar's search is on every portal page; from a world it opens Explore with the search.
    await fresh.page.getByTestId('explore-search').fill(word)
    await fresh.page.getByTestId('explore-search').press('Enter')
    await fresh.page.waitForURL(`/explore?q=${word}`)
    await expect(cards(fresh.page)).toHaveText([`${word} Open Door`])
    await fresh.context.close()
  })

  test('Log in from Explore comes back to Explore, not the workspace; My workspace and Explore cross over', async ({
    page,
    request,
  }) => {
    const username = await account(request)
    await page.goto(`/explore?category=games`)
    await page.getByTestId('portal-login').click()
    await logInOnPage(page, username)

    await page.waitForURL('/explore?category=games')
    await expect(page.getByTestId('portal-workspace')).toHaveText('My workspace')
    await expect(page.getByTestId('portal-login')).toHaveCount(0)
    await expect(page.getByTestId('explore-category-games')).toHaveAttribute('aria-current', 'true')

    await page.getByTestId('portal-workspace').click()
    await page.waitForURL('/app')
    await page.getByTestId('home-explore').click()
    await page.waitForURL('/explore')

    // Signing out in the portal leaves the visitor where they were reading.
    await page.getByTestId('account-menu-trigger').click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByTestId('portal-login')).toBeVisible()
    await expect(page).toHaveURL(/\/explore$/)
  })

  test('Log in from a public world comes back to that world', async ({
    page,
    request,
    browser,
  }) => {
    const word = token()
    await author(page, 'Bram Ellery')
    const slug = await world(page, { name: `${word} Return`, category: BOOKS, genres: [MYSTERY] })

    const { context, page: visitor } = await stranger(browser)
    const username = await account(request)
    await visitor.goto(`/worlds/${slug}`)
    await visitor.getByTestId('portal-login').click()
    await logInOnPage(visitor, username)
    await visitor.waitForURL(`/worlds/${slug}`)
    await expect(visitor.getByTestId('portal-workspace')).toBeVisible()
    await expect(visitor.getByTestId('public-world')).toBeVisible()
    await context.close()
  })

  test('Create account, reached through Log in from a public world, comes back to that world', async ({
    page,
    browser,
  }) => {
    const word = token()
    await author(page, 'Cato Wren')
    const slug = await world(page, { name: `${word} Welcome`, category: BOOKS, genres: [MYSTERY] })

    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/worlds/${slug}`)
    await visitor.getByTestId('portal-login').click()
    await visitor.waitForURL('/login')
    await visitor.getByRole('link', { name: 'Create account' }).click()
    await visitor.waitForURL('/register')
    // A cold dev server may reload the page once while it prepares the screen's code; fill it after that.
    await visitor.waitForLoadState('networkidle')
    const newcomer = unique('newcomer')
    const username = visitor.getByLabel('Username')
    await username.fill(newcomer)
    await visitor.getByLabel('Email').fill(`${newcomer}@example.test`)
    await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await visitor.getByLabel('Confirm password').fill(PASSWORD)
    await expect(username).toHaveValue(newcomer)
    await visitor.getByRole('button', { name: 'Create account' }).click()
    await visitor.waitForURL(`/worlds/${slug}`)
    await expect(visitor.getByTestId('portal-workspace')).toBeVisible()
    await context.close()
  })

  test('a return address that is not a LorEvolve page is never followed', async ({
    page,
    request,
    baseURL,
  }) => {
    const username = await account(request)
    const origin = new URL(baseURL!).origin

    // Router state is the only carrier, and anything on the page could write history state - so forge it.
    for (const from of [
      '//evil.example/steal',
      '/\evil.example',
      '/\t/evil.example',
      'https://evil.example/',
      'javascript:alert(1)',
      '/login',
    ]) {
      await page.goto('/login')
      await page.evaluate((value) => {
        history.replaceState({ usr: { from: value }, key: 'forged', idx: 0 }, '', '/login')
      }, from)
      await page.reload()
      await logInOnPage(page, username)
      // Never away from LorEvolve. A value that is only a same-origin path ('/\evil.example' is '/evil.example') may be
      // followed to that path, which nothing holds, so it lands on LorEvolve's home (031); everything else on /app.
      await page.waitForURL((url) => url.pathname === '/app' || url.pathname === '/')
      expect(new URL(page.url()).origin, from).toBe(origin)
      await page.getByTestId('account-menu-trigger').click()
      await page.getByRole('button', { name: 'Sign out' }).click()
      // Signing out from the workspace lands on Login; from the portal it stays on the portal.
      await expect(page.getByTestId('account-menu-trigger')).toHaveCount(0)
    }
  })
})
