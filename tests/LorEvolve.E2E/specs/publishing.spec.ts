import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'
import { answerConfirms } from './support/confirm'

/**
 * Public portal 008: a universe is private until its owner publishes it, publishing needs everything a public
 * card shows and says exactly what becomes public, and anyone - signed in or not - reads only that shell, until
 * the owner makes it private again (ADR 0036). What the API promises is settled by `UniversePublicationTests`,
 * `UniverseArtworkTests` and `PublicationBackupTests`; what only a browser can show is here: the Settings section,
 * its checklist and confirmations, the artwork framed 16:10, the public name on the Profile, the leave guard, the
 * public routes outside the workspace, and all of it at a phone's width, dark, and right to left.
 *
 * Every test builds its own account and universe. "Anonymous" is Playwright's own request context, which shares no
 * cookie with the page.
 */
const PASSWORD = 'Test-password-123!'
const LEAVE_DETAILS = 'The public details have unsaved changes. Leave without saving them?'
const ALLOWED = [
  'authorDisplayName',
  'authorSlug',
  'cardImageUrl',
  'category',
  'genres',
  'name',
  'originalCreator',
  'originalWork',
  'publicSummary',
  'publishedAt',
  'slug',
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('publisher')
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
  return (response.status() === 204 ? null : await response.json()) as T
}

async function newUniverse(page: Page, name: string) {
  return (await api<{ id: string }>(page, 'POST', '/api/universes', { name, description: null }))!
    .id
}

/** Everything publishing needs, written through the API, so a test can start where its own subject begins. */
async function prepare(page: Page, universeId: string, author: string) {
  await api(page, 'PUT', `/api/universes/${universeId}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 3,
    genres: [1, 4],
  })
  const artwork = await page.request.put(`/api/universes/${universeId}/artwork`, {
    multipart: { file: artworkFile('art.png') },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: author })
}

/** A wide picture: a blue band across the middle of a sandy one. */
function artworkFile(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(800, 500, (_x, y) => (y > 180 && y < 320 ? [40, 70, 180] : [214, 190, 150])),
  }
}

async function dialogs(page: Page) {
  const asked: string[] = []
  const answers: boolean[] = []
  // A reload or a closed tab is the browser's own prompt; everything else is LorEvolve's confirmation (Issue #50).
  page.on('dialog', (dialog) => {
    asked.push(dialog.type() === 'beforeunload' ? 'beforeunload' : dialog.message())
    void (answers.shift() ? dialog.accept() : dialog.dismiss())
  })
  await answerConfirms(page, () => answers.shift() ?? false, asked)
  return {
    asked,
    answer(...next: boolean[]) {
      answers.push(...next)
    },
  }
}

async function publicNames(anonymous: APIRequestContext) {
  const response = await anonymous.get('/api/public/universes?pageSize=48')
  expect(response.ok()).toBe(true)
  const first = (await response.json()) as { items: { name: string }[]; totalPages: number }
  const names = first.items.map((item) => item.name)
  for (let page = 2; page <= first.totalPages; page++) {
    const next = (await (
      await anonymous.get(`/api/public/universes?pageSize=48&page=${page}`)
    ).json()) as { items: { name: string }[] }
    names.push(...next.items.map((item) => item.name))
  }
  return names
}

/** A browser with no session at all, for the pages a stranger sees. */
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

test.describe('publishing a universe', () => {
  test('a new universe is private, the portal cannot find it, and publishing names what is missing', async ({
    page,
    request,
    browser,
  }) => {
    await signUp(page)
    const name = unique('Hollowmere ')
    const universeId = await newUniverse(page, name)

    await page.goto(`/app/universes/${universeId}/publish`)
    const section = page.getByTestId('public-portal')
    await expect(section.getByTestId('publication-status')).toHaveText(
      'Private This universe is visible only in your workspace.',
    )
    await expect(section.getByText('does not publish its lore entries or stories')).toBeVisible()
    await expect(section.getByTestId('publication-checklist').locator('li')).toHaveText([
      '○Public summary - needed',
      '○Category - needed',
      '○At least one genre - needed',
      '○Artwork - needed',
      '○Your public name - needed',
    ])

    await section.getByTestId('publish').click()
    const problem = section.getByTestId('publication-problem')
    await expect(problem).toBeFocused()
    await expect(problem.locator('li')).toHaveText([
      'Write a public summary.',
      'Choose a category.',
      'Choose at least one genre.',
      "Add the universe's artwork.",
      'Choose the public name your universes are published under.',
    ])
    await expect(section.getByTestId('publication-status')).toContainText('Private')

    // Nothing public finds it: not the listing, not the address it would have, not the page.
    expect(await publicNames(request)).not.toContain(name)
    const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    expect((await request.get(`/api/public/universes/${stem}`)).status()).toBe(404)
    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/worlds/${stem}`)
    await expect(visitor.getByTestId('world-missing')).toHaveText(
      /This world is not available\.\s*Its address may be wrong, or it is not public\./,
    )
    await context.close()

    // Nobody else can publish it, and nobody without a session can even ask.
    expect((await request.post(`/api/universes/${universeId}/publish`)).status()).toBe(401)
  })

  test('an author prepares, publishes, views and makes private a universe', async ({
    page,
    request,
    browser,
  }) => {
    await signUp(page)
    const name = unique('The Nail Ark ')
    const universeId = await newUniverse(page, name)
    const publishUrl = `/app/universes/${universeId}/publish`
    const { asked } = await dialogs(page)
    await page.goto(publishUrl)
    const section = page.getByTestId('public-portal')

    // ---------- The public details ----------

    await section.getByLabel('Public summary').fill('A drowned coast where the tide keeps count.')
    await section.getByLabel('Category').selectOption({ label: 'Games' })
    const genres = section.getByTestId('public-genres')
    await genres.getByLabel('Fantasy').check()
    await genres.getByLabel('Adventure').check()
    await genres.getByLabel('Horror').check()
    // Three is the most a world names: the rest wait until one is let go.
    await expect(genres.getByLabel('Mystery')).toBeDisabled()
    await genres.getByLabel('Horror').uncheck()
    await expect(genres.getByLabel('Mystery')).toBeEnabled()
    await section.getByTestId('save-public-details').click()
    await expect(section.getByTestId('public-details-saved')).toHaveText('Saved.')

    // ---------- The artwork, framed as its card ----------

    await section.getByTestId('artwork-input').setInputFiles(artworkFile('coast.png'))
    const cropper = page.getByTestId('image-crop-dialog')
    await expect(cropper.getByRole('heading', { name: 'Frame the artwork' })).toBeVisible()
    await expect(cropper.getByRole('group', { name: 'Card frame' })).toBeVisible()
    await expect(cropper.getByText('Card preview')).toBeVisible()
    await expect(cropper.getByTestId('image-crop-confirm')).toBeEnabled()
    await cropper.getByTestId('image-crop-confirm').click()
    await expect(cropper).toHaveCount(0)
    const card = section.getByTestId('artwork-card')
    await expect(card).toBeVisible()
    await expect
      .poll(() => card.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBe(800)
    // 16:10 on screen, as it is cut.
    const box = (await card.boundingBox())!
    expect(box.width / box.height).toBeCloseTo(1.6, 1)

    // ---------- The author's public name, on the Profile ----------

    await expect(section.getByTestId('publication-author')).toContainText('no public name yet')
    await section.getByRole('link', { name: 'Choose one on your profile' }).click()
    await page.waitForURL('/app/profile')
    const author = unique('Mara Vell ')
    await page.getByLabel('Public name').fill(author)
    await page.getByTestId('save-public-name').click()
    await expect(page.getByTestId('public-name-saved')).toBeVisible()

    await page.goto(publishUrl)
    await expect(section.getByTestId('publication-author')).toContainText(`Published as ${author}`)
    await expect(section.getByTestId('publication-checklist').locator('li')).toHaveText([
      '✓Public summary - done',
      '✓Category - done',
      '✓At least one genre - done',
      '✓Artwork - done',
      '✓Your public name - done',
    ])

    // ---------- Publishing: what becomes public, and what does not ----------

    await section.getByTestId('publish').click()
    const confirm = section.getByTestId('publish-confirm')
    await expect(confirm).toBeFocused()
    await expect(confirm.getByRole('heading')).toHaveText(`Publish ${name}?`)
    await expect(confirm.locator('dl')).toContainText(`Title${name}`)
    await expect(confirm.locator('dl')).toContainText(
      'Public summaryA drowned coast where the tide keeps count.',
    )
    await expect(confirm.locator('dl')).toContainText('CategoryGames')
    await expect(confirm.locator('dl')).toContainText('GenresFantasy, Adventure')
    await expect(confirm.locator('dl')).toContainText(`Author${author}`)
    await expect(confirm).toContainText(
      'Not published: Any lore entry, story, scene, scene prose or plot arc you have not published where it is written, notes, ideas, the timeline, world rules, relationships, Canon, the Trash',
    )
    // No entry was selected, and the confirmation says so rather than listing nothing (Issue #47).
    await expect(confirm.getByTestId('publish-confirm-no-selected-lore')).toContainText(
      'no entry is selected for publication, so none becomes public with the world.',
    )
    await expect(confirm.getByTestId('publish-confirm-selected-entry')).toHaveCount(0)

    // Keeping it private changes nothing.
    await confirm.getByRole('button', { name: 'Keep private' }).click()
    await expect(section.getByTestId('publication-status')).toContainText('Private')

    await section.getByTestId('publish').click()
    await section.getByTestId('confirm-publish').click()
    await expect(section.getByTestId('publication-status')).toHaveText(
      'Public This universe is visible on the LorEvolve portal.',
    )
    await expect(section.getByTestId('publication-announcement')).toBeVisible()
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
    await expect(section.getByTestId('publication-address')).toContainText(`/worlds/${slug}`)

    // A public universe keeps its artwork: replace, never remove.
    await expect(section.getByTestId('artwork-remove')).toHaveCount(0)
    await expect(section.getByTestId('artwork-pick')).toHaveText('Replace artwork')

    // ---------- What anyone can read ----------

    expect(await publicNames(request)).toContain(name)
    const shell = await request.get(`/api/public/universes/${slug}`)
    expect(shell.ok()).toBe(true)
    const body = (await shell.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(ALLOWED)
    expect(body.authorDisplayName).toBe(author)
    expect((await request.get(body.cardImageUrl as string)).status()).toBe(200)

    // Saved details, an uploaded artwork and a publish leave nothing unsaved: no form on Settings - the universe's
    // details included - asks on the way out.
    await section.getByTestId('view-public-page').click()
    await page.waitForURL(`/worlds/${slug}`)
    await expect.poll(() => asked).toEqual([])
    const world = page.getByTestId('public-world')
    await expect(world.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(world).toContainText(`by ${author}`)
    await expect(world.getByTestId('public-world-category')).toHaveText('Games')
    await expect(world.locator('.genrechip')).toHaveText(['Fantasy', 'Adventure'])
    await expect(world).toContainText('A drowned coast where the tide keeps count.')
    await expect
      .poll(() =>
        world
          .getByTestId('public-world-card')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0)
    // The portal's own frame, and none of the workspace's.
    await expect(page.getByTestId('portal-workspace')).toHaveText('My workspace')
    await expect(page.getByTestId('workspace-nav-toggle')).toHaveCount(0)
    await expect(page.getByTestId('workspace-name')).toHaveCount(0)

    // Explore lists it, and the workspace's front door leads there.
    await page.goto('/app')
    await page.getByTestId('home-explore').click()
    await page.waitForURL('/explore')
    await expect(page.getByTestId('explore-list').getByRole('link', { name })).toBeVisible()

    // Signed out, the same page, with the way in instead of the way back.
    const { context, page: visitor } = await stranger(browser)
    await visitor.goto(`/worlds/${slug}`)
    await expect(visitor.getByTestId('public-world').getByRole('heading', { level: 1 })).toHaveText(
      name,
    )
    await expect(visitor.getByTestId('portal-session')).toContainText('Log in')
    await expect(visitor.getByTestId('portal-session')).toContainText('Create account')

    // ---------- Making it private again ----------

    await page.goto(publishUrl)
    await section.getByTestId('unpublish').click()
    const unpublish = section.getByTestId('unpublish-confirm')
    await expect(unpublish).toBeFocused()
    await expect(unpublish).toContainText(
      'Its public page and its place in Explore stop being available straight away.',
    )
    await section.getByTestId('confirm-unpublish').click()
    await expect(section.getByTestId('publication-status')).toContainText('Private')

    expect((await request.get(`/api/public/universes/${slug}`)).status()).toBe(404)
    expect(await publicNames(request)).not.toContain(name)
    await visitor.reload()
    await expect(visitor.getByTestId('world-missing')).toBeVisible()
    await context.close()
  })

  test('unsaved public details are asked about once, put back is clean, and a save lets them go', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Guarded '))
    const publishUrl = `/app/universes/${universeId}/publish`
    const { asked, answer } = await dialogs(page)
    await page.goto(publishUrl)
    const section = page.getByTestId('public-portal')
    const summary = section.getByLabel('Public summary')

    // Untouched, leaving asks nothing.
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.goto(publishUrl)
    await expect.poll(() => asked).toEqual([])

    // Written, a link asks, and staying keeps the draft.
    await summary.fill('A lake that remembers.')
    await page.getByTestId('workspace-lore').click()
    await expect.poll(() => asked).toEqual([LEAVE_DETAILS])
    await expect(page).toHaveURL(/\/publish$/)
    await expect(summary).toHaveValue('A lake that remembers.')

    // Publishing will not go over unsaved details.
    await section.getByTestId('publish').click()
    await expect(section.getByTestId('publication-problem')).toContainText(
      'Save the public details first',
    )

    // Put back, it is clean again. (Two unsaved forms as one question: Settings' tabs, in workspace-settings.spec.ts.)
    await summary.fill('')
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(1)

    // A failed save keeps the draft and the question.
    await page.goto(publishUrl)
    await page.route('**/api/universes/*/publication', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ title: 'The public details could not be saved.' }),
          })
        : route.fallback(),
    )
    await summary.fill('A lake that remembers.')
    await section.getByTestId('save-public-details').click()
    await expect(section.locator('.form__message')).toHaveText(
      'The public details could not be saved.',
    )
    await page.getByTestId('workspace-lore').click()
    await expect.poll(() => asked.at(-1)).toBe(LEAVE_DETAILS)
    await expect(page).toHaveURL(/\/publish$/)

    // A saved one lets it go.
    await page.unroute('**/api/universes/*/publication')
    await section.getByTestId('save-public-details').click()
    await expect(section.getByTestId('public-details-saved')).toBeVisible()
    const settled = asked.length
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect.poll(() => asked).toHaveLength(settled)

    // Answered yes, the author leaves.
    await page.goto(publishUrl)
    await summary.fill('Changed again.')
    answer(true)
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
  })

  test('right to left and on a phone: names read in their own direction and nothing scrolls sideways', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const name = `آكرون — 12 / Wright ${unique('')}`
    const universeId = await newUniverse(page, name)
    await prepare(page, universeId, 'مارا فيل')
    await api(page, 'PUT', `/api/universes/${universeId}/publication`, {
      publicSummary: 'עיר שקועה, 12 שערים (וגשר אחד).',
      category: 1,
      genres: [16],
    })

    await page.goto(`/app/universes/${universeId}/publish`)
    const section = page.getByTestId('public-portal')
    await expect(section.getByTestId('publication-author').locator('bdi')).toHaveText('مارا فيل')
    await noSidewaysScroll(page)

    await section.getByTestId('publish').click()
    const confirm = section.getByTestId('publish-confirm')
    await expect(confirm.getByRole('heading').locator('bdi')).toHaveText(name)
    await noSidewaysScroll(page)
    await section.getByTestId('confirm-publish').click()
    await expect(section.getByTestId('publication-status')).toContainText('Public')
    const address = await section.getByTestId('publication-address').textContent()
    const slug = /\/worlds\/([a-z0-9-]+)/.exec(address ?? '')![1]
    // The address is plain letters; the name is never changed to make one.
    expect(slug).toMatch(/^12-wright-[a-z0-9-]+$/)

    for (const width of [390, 360]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ colorScheme })
        await page.goto(`/app/universes/${universeId}/publish`)
        await expect(section.getByTestId('publication-status')).toContainText('Public')
        await noSidewaysScroll(page)
      }
    }

    const { context, page: visitor } = await stranger(browser)
    await visitor.setViewportSize({ width: 360, height: 780 })
    await visitor.goto(`/worlds/${slug}`)
    const world = visitor.getByTestId('public-world')
    await expect(world.getByRole('heading', { level: 1 }).locator('bdi')).toHaveText(name)
    await expect(world.getByTestId('public-world-author').locator('bdi')).toHaveText('مارا فيل')
    await expect(world).toContainText('עיר שקועה, 12 שערים (וגשר אחד).')
    await noSidewaysScroll(visitor)
    await visitor.goto('/explore')
    await expect(visitor.getByTestId('explore-list')).toBeVisible()
    await noSidewaysScroll(visitor)
    await context.close()
  })
})
