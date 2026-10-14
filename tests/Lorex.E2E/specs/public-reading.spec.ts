import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Public portal 011: reading a public universe. From an Explore card to the world, into one of its published entries and
 * stories, and to its author - anonymously, signed in, as the owner, right to left and on a phone. The API's promises (the
 * two-level predicate, the allow-lists, the story summary rule, the author address and photo, the owner bridge) are
 * settled by `PublicReadingTests` and `PublicAuthorTests`; what only a browser can show is here: the pages, where every
 * link goes, what never appears, one not-found page for every hidden thing, and a sign-in that comes back where it began.
 *
 * Every test builds its own author. "Anonymous" is a browser context with no cookie at all.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

function slugOf(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function signUp(page: Page) {
  const username = unique('author')
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

const picture = (tint: [number, number, number]) => ({
  name: 'art.png',
  mimeType: 'image/png',
  buffer: png(800, 500, (x, y) => (y > 180 && y < 320 ? tint : [(x * 3) % 255, 60, 110])),
})

interface World {
  id: string
  slug: string
  name: string
}

/** A public universe by `author`, with everything publishing needs. */
async function world(page: Page, author: string, name = unique('Tideholm ')): Promise<World> {
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: 'Private description: the heir dies.',
  }))!.id
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 4,
    genres: [1, 4],
  })
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: { file: picture([40, 70, 180]) },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: author })
  const slug = (await api<{ publicSlug: string }>(page, 'POST', `/api/universes/${id}/publish`))!
    .publicSlug
  return { id, slug, name }
}

async function entry(page: Page, world: World, name: string, summary: string, publish = true) {
  const types = (await api<{ id: string }[]>(
    page,
    'GET',
    `/api/universes/${world.id}/entity-types`,
  ))!
  const id = (await api<{ id: string }>(page, 'POST', `/api/universes/${world.id}/entities`, {
    entityTypeId: types[0].id,
    name,
    summary,
    canonStatus: 2,
    aliases: ['Secret alias'],
    tags: ['secret-tag'],
    fields: [],
  }))!.id
  await api(page, 'PUT', `/api/universes/${world.id}/entities/${id}/article`, {
    content: JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: `The article of ${name}.` }] },
      ],
    }),
    expectedVersion: 0,
  })
  if (publish) await api(page, 'POST', `/api/universes/${world.id}/entities/${id}/publish`)
  return id
}

async function story(page: Page, world: World, title: string, publicSummary: string | null) {
  const id = (await api<{ id: string }>(page, 'POST', `/api/universes/${world.id}/stories`, {
    title,
    premise: 'Private premise: the narrator lies.',
    status: 1,
  }))!.id
  if (publicSummary) {
    await api(page, 'PUT', `/api/universes/${world.id}/stories/${id}/publication`, {
      publicSummary,
    })
    await api(page, 'POST', `/api/universes/${world.id}/stories/${id}/publish`)
  }
  return id
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

test.describe('reading a public universe', () => {
  test('a reader goes from Explore to a world, its lore, its story and its author, and sees only what was published', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const author = unique('Ione ')
    const w = await world(page, author)
    await entry(page, w, 'Tidewarden', 'Keeper of the count.')
    await entry(page, w, 'Hidden heir', 'Never published.', false)
    await story(page, w, 'The Long Ebb', 'Seven nights and a tide that will not come back.')
    await story(page, w, 'Unwritten tale', null)

    const { context, page: reader } = await stranger(browser)
    await reader.goto(`/explore?q=${encodeURIComponent(w.name)}`)
    await reader
      .locator('.worldcard')
      .filter({ hasText: w.name })
      .getByRole('link', { name: w.name })
      .click()
    await reader.waitForURL(`/worlds/${w.slug}`)

    const world_ = reader.getByTestId('public-world')
    await expect(world_.getByRole('heading', { level: 1 })).toHaveText(w.name)
    await expect(world_.getByTestId('public-world-summary')).toHaveText(
      'A drowned coast where the tide keeps count.',
    )
    await expect(reader.getByTestId('public-lore-list').locator('.plorecard__name')).toHaveText([
      'Tidewarden',
    ])
    await expect(reader.getByTestId('public-story-list').locator('.pstorycard__title')).toHaveText([
      'The Long Ebb',
    ])
    for (const secret of [
      'Hidden heir',
      'Unwritten tale',
      'Private description',
      'Private premise',
    ]) {
      await expect(reader.locator('main')).not.toContainText(secret)
    }
    await expect(reader.getByTestId('edit-this-world')).toHaveCount(0)
    await expect(reader.locator('h1')).toHaveCount(1)

    // An entry: a reference page, its article, and nothing else of the entry.
    await reader.getByRole('link', { name: /Tidewarden/ }).click()
    await reader.waitForURL(`/worlds/${w.slug}/lore/tidewarden`)
    const lore = reader.getByTestId('public-lore')
    await expect(lore.getByRole('heading', { level: 1 })).toHaveText('Tidewarden')
    await expect(lore.getByTestId('public-lore-summary')).toHaveText('Keeper of the count.')
    await expect(lore.getByTestId('lore-article')).toHaveText('The article of Tidewarden.')
    await expect(lore).not.toContainText('Secret alias')
    await expect(lore).not.toContainText('secret-tag')
    await expect(lore.getByRole('button', { name: /edit|save|history/i })).toHaveCount(0)

    // Back to the world, then a story: its public summary, never its premise.
    await lore.getByTestId('public-lore-world').click()
    await reader.waitForURL(`/worlds/${w.slug}`)
    await reader.getByRole('link', { name: /The Long Ebb/ }).click()
    await reader.waitForURL(`/worlds/${w.slug}/stories/the-long-ebb`)
    const told = reader.getByTestId('public-story')
    await expect(told.getByRole('heading', { level: 1 })).toHaveText('The Long Ebb')
    await expect(told.getByTestId('public-story-summary')).toHaveText(
      'Seven nights and a tide that will not come back.',
    )
    await expect(told).not.toContainText('Private premise')

    // The author's name leads to their author page: a portal page, with only their public worlds.
    await told.getByTestId('public-story-author').click()
    await reader.waitForURL(`/authors/${slugOf(author)}`)
    const profile = reader.getByTestId('public-author')
    await expect(profile.getByRole('heading', { level: 1 })).toHaveText(author)
    await expect(
      profile.getByTestId('public-author-worlds').locator('.worldcard__name'),
    ).toHaveText([w.name])
    await expect(profile.getByTestId('public-author-placeholder')).toBeVisible()
    await expect(reader.locator('.portal')).toHaveCount(1)
    await context.close()
  })

  test('a private or missing child page is one not-found page, and making the world private takes everything down', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const author = unique('Wren ')
    const w = await world(page, author)
    await entry(page, w, 'Shown keeper', 'Public.')
    await entry(page, w, 'Kept keeper', 'Private.', false)
    await story(page, w, 'Shown tale', 'For readers.')

    const { context, page: reader } = await stranger(browser)
    await reader.goto(`/worlds/${w.slug}/lore/kept-keeper`)
    await expect(reader.getByTestId('lore-missing')).toBeVisible()
    const privateText = (await reader.getByTestId('lore-missing').textContent())!
    await reader.goto(`/worlds/${w.slug}/lore/never-was`)
    await expect(reader.getByTestId('lore-missing')).toHaveText(privateText)
    await reader.goto(`/worlds/${w.slug}/stories/never-was`)
    await expect(reader.getByTestId('story-missing')).toBeVisible()

    await reader.goto(`/worlds/${w.slug}/lore/shown-keeper`)
    await expect(reader.getByTestId('public-lore')).toBeVisible()

    // The world made private: the world, its entry, its story and its author all answer as if never there.
    await api(page, 'POST', `/api/universes/${w.id}/unpublish`)
    for (const [path, id] of [
      [`/worlds/${w.slug}`, 'world-missing'],
      [`/worlds/${w.slug}/lore/shown-keeper`, 'lore-missing'],
      [`/worlds/${w.slug}/stories/shown-tale`, 'story-missing'],
      [`/authors/${slugOf(author)}`, 'author-missing'],
    ] as const) {
      await reader.goto(path)
      await expect(reader.getByTestId(id)).toBeVisible()
      await expect(reader.locator('main')).not.toContainText('Shown keeper')
      await expect(reader.locator('main')).not.toContainText('For readers.')
    }

    // The entry is still selected; publishing the world again brings it back.
    await api(page, 'POST', `/api/universes/${w.id}/publish`)
    await reader.goto(`/worlds/${w.slug}/lore/shown-keeper`)
    await expect(reader.getByTestId('public-lore')).toBeVisible()
    await context.close()
  })

  test('only the owner sees the way back to the workspace, and it goes to the right place', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Owner '))
    const entryId = await entry(page, w, 'Bridge keeper', 'Keeps the bridge.')
    const storyId = await story(page, w, 'Bridge tale', 'Across the water.')

    await page.goto(`/worlds/${w.slug}`)
    await page.getByTestId('edit-this-world').click()
    await page.waitForURL(`/app/universes/${w.id}`)

    await page.goto(`/worlds/${w.slug}/lore/bridge-keeper`)
    await page.getByTestId('edit-in-workspace').click()
    await page.waitForURL(`/app/universes/${w.id}/lore/${entryId}`)

    await page.goto(`/worlds/${w.slug}/stories/bridge-tale`)
    await page.getByTestId('edit-in-workspace').click()
    await page.waitForURL(`/app/universes/${w.id}/stories/${storyId}`)

    // My workspace enters the workspace; the portal never does so on its own.
    await page.goto(`/worlds/${w.slug}`)
    await page.getByTestId('portal-workspace').click()
    await page.waitForURL('/app')

    // Anyone else - another account, or nobody - sees the reader's page only.
    const other = await stranger(browser)
    const username = unique('reader')
    expect(
      (
        await other.context.request.post('/api/auth/register', {
          data: { username, email: `${username}@example.test`, password: PASSWORD },
        })
      ).ok(),
    ).toBe(true)
    await other.page.goto(`/worlds/${w.slug}`)
    await expect(other.page.getByTestId('public-world')).toBeVisible()
    await expect(other.page.getByTestId('portal-workspace')).toBeVisible()
    await expect(other.page.getByTestId('edit-this-world')).toHaveCount(0)
    await other.page.goto(`/worlds/${w.slug}/lore/bridge-keeper`)
    await expect(other.page.getByTestId('public-lore')).toBeVisible()
    await expect(other.page.getByTestId('edit-in-workspace')).toHaveCount(0)
    await other.context.clearCookies()
    await other.page.goto(`/worlds/${w.slug}`)
    await expect(other.page.getByTestId('portal-login')).toBeVisible()
    await expect(other.page.getByTestId('edit-this-world')).toHaveCount(0)
    await other.context.close()
  })

  test('logging in from any public page comes back to that page', async ({ page, browser }) => {
    await signUp(page)
    const author = unique('Return ')
    const w = await world(page, author)
    await entry(page, w, 'Return keeper', 'Comes back.')
    await story(page, w, 'Return tale', 'Comes back too.')

    const { context, page: reader } = await stranger(browser)
    const username = unique('returner')
    expect(
      (
        await context.request.post('/api/auth/register', {
          data: { username, email: `${username}@example.test`, password: PASSWORD },
        })
      ).ok(),
    ).toBe(true)

    for (const path of [
      `/worlds/${w.slug}`,
      `/worlds/${w.slug}/lore/return-keeper`,
      `/worlds/${w.slug}/stories/return-tale`,
      `/authors/${slugOf(author)}`,
    ]) {
      await context.clearCookies()
      await reader.goto(path)
      await reader.getByTestId('portal-login').click()
      await expect(reader).toHaveURL(/\/login$/)
      await reader.getByLabel('Username or email').fill(username)
      await reader.getByLabel('Password').fill(PASSWORD)
      await reader.getByRole('button', { name: 'Sign in' }).click()
      await reader.waitForURL(path)
      await expect(reader.getByTestId('portal-workspace')).toBeVisible()
    }
    await context.close()
  })

  test('the author page is the portal, the account page is the workspace, and a photo is public only by choice', async ({
    page,
    browser,
  }) => {
    const username = await signUp(page)
    const author = unique('Pell ')
    const w = await world(page, author)
    await world(page, author).then((second) =>
      api(page, 'POST', `/api/universes/${second.id}/unpublish`),
    )

    // A profile photo, uploaded on the account: private.
    const photo = await page.request.put('/api/profile/image', {
      multipart: { file: picture([200, 120, 60]) },
    })
    expect(photo.ok()).toBe(true)

    const { context, page: reader } = await stranger(browser)
    await reader.goto(`/authors/${slugOf(author)}`)
    await expect(reader.getByTestId('public-author-placeholder')).toBeVisible()
    await expect(reader.getByTestId('public-author-avatar')).toHaveCount(0)
    await expect(reader.getByTestId('public-author-worlds').locator('.worldcard__name')).toHaveText(
      [w.name],
    )

    // The account's own page stays in the workspace: email and id there, and the choice to show the photo.
    await page.goto('/app/profile')
    await expect(page.getByTestId('profile')).toBeVisible()
    await expect(page.locator('.portal')).toHaveCount(0)
    await expect(page.getByTestId('profile-email')).toHaveText(`${username}@example.test`)
    const settings = page.getByTestId('public-author-settings')
    await expect(settings.getByTestId('view-author-page')).toHaveAttribute(
      'href',
      `/authors/${slugOf(author)}`,
    )
    const toggle = settings.getByTestId('public-photo-toggle')
    await expect(toggle).not.toBeChecked()
    await toggle.check()
    await expect(toggle).toBeChecked()

    await reader.reload()
    const avatar = reader.getByTestId('public-author-avatar')
    await expect(avatar).toBeVisible()
    await expect
      .poll(() => avatar.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    // Nothing of the account reaches the public page.
    await expect(reader.locator('main')).not.toContainText(username)
    await expect(reader.locator('main')).not.toContainText('example.test')

    // Hidden again: gone at the next read.
    await toggle.uncheck()
    await expect(toggle).not.toBeChecked()
    await reader.reload()
    await expect(reader.getByTestId('public-author-placeholder')).toBeVisible()
    await context.close()
  })

  test('Lorex’s home is the front door, signed in or out, and the installed app opens Explore', async ({
    page,
    browser,
    request,
  }) => {
    const manifest = JSON.parse(await (await request.get('/manifest.webmanifest')).text()) as {
      start_url: string
    }
    expect(manifest.start_url).toBe('/explore')

    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(manifest.start_url)
    await expect(visitor).toHaveURL(/\/explore$/)
    await visitor.goto('/')
    await expect(visitor.getByTestId('landing')).toBeVisible()
    await expect(visitor.getByTestId('portal-login')).toBeVisible()
    await context.close()

    // Signed in, and last seen in the workspace: still the portal first.
    await signUp(page)
    await page.goto('/app')
    await page.goto(manifest.start_url)
    await expect(page).toHaveURL(/\/explore$/)
    await expect(page.getByTestId('portal-workspace')).toBeVisible()
    await page.goto('/')
    await expect(page.getByTestId('landing')).toBeVisible()
    await expect(page.getByTestId('portal-workspace')).toBeVisible()

    // A deep link is still a deep link.
    const w = await world(page, unique('Deep '))
    await page.goto(`/worlds/${w.slug}`)
    await expect(page.getByTestId('public-world')).toBeVisible()
  })

  test('right to left and on a phone: authored text keeps its direction, the portal does not flip, nothing scrolls sideways', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const author = 'مارا فيل'
    const w = await world(page, author, `مدينة ${unique('')}`)
    await entry(page, w, 'حارس المد', 'حارس يعدّ ما يتركه البحر، منذ 1847.')
    await story(page, w, 'מדינת המלח — The Salt Kingdom 1847', 'עיר שקועה, 12 שערים (וגשר אחד).')

    const { context, page: reader } = await stranger(browser)
    for (const width of [390, 360]) {
      await reader.setViewportSize({ width, height: 800 })

      await reader.goto(`/worlds/${w.slug}`)
      await expect(
        reader.getByTestId('public-world').getByRole('heading', { level: 1 }),
      ).toHaveText(w.name)
      await expect(reader.getByTestId('public-world-author').locator('bdi')).toHaveText(author)
      await expect(reader.locator('.portal__bar')).toHaveCSS('direction', 'ltr')
      await noSidewaysScroll(reader)

      await reader.getByRole('link', { name: /حارس المد/ }).click()
      await expect(reader.getByTestId('public-lore').getByRole('heading', { level: 1 })).toHaveText(
        'حارس المد',
      )
      await expect(reader.getByTestId('public-lore-summary')).toHaveText(
        'حارس يعدّ ما يتركه البحر، منذ 1847.',
      )
      await noSidewaysScroll(reader)

      await reader.goto(`/worlds/${w.slug}/stories/the-salt-kingdom-1847`)
      await expect(reader.getByTestId('public-story-summary')).toHaveText(
        'עיר שקועה, 12 שערים (וגשר אחד).',
      )
      await noSidewaysScroll(reader)

      await reader.getByTestId('public-story-author').click()
      await expect(
        reader.getByTestId('public-author').getByRole('heading', { level: 1 }),
      ).toHaveText(author)
      await noSidewaysScroll(reader)
    }
    await context.close()
  })
})
