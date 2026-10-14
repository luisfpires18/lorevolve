import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Product refinement 015: publishing what is inside a story, the Publish page's one visibility action, and attribution for
 * a world based on someone else's work. The API's promises - three-level predicates, allow-lists, order, no ids, backup and
 * migration - are settled by `StoryContentPublicationTests`, `UniverseAttributionTests` and the migration test; what only a
 * browser shows is here: the pills beside what they publish and their three states, the reader page and what it leaves
 * out, the header action and its confirmations, the attribution form and how the portal credits, in both themes, on a
 * phone and at 200% zoom. Names are invented.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
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

interface World {
  id: string
  name: string
}

/** A universe with everything publishing needs; published only when asked. */
async function world(page: Page, author: string, publish: boolean): Promise<World> {
  const name = unique('Saltmere ')
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', { name }))!.id
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 4,
    genres: [1],
  })
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: {
        name: 'art.png',
        mimeType: 'image/png',
        buffer: png(800, 500, (x, y) => [(x * 3) % 255, 60 + (y % 90), 110]),
      },
    },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: author })
  if (publish) await api(page, 'POST', `/api/universes/${id}/publish`)
  return { id, name }
}

interface Story {
  id: string
  slug: string
  scenes: string[]
  arc: string
}

/** A story with three scenes, prose on two of them and one arc - all private - optionally published itself. */
async function story(page: Page, w: World, title: string, publish: boolean): Promise<Story> {
  const base = `/api/universes/${w.id}/stories`
  const id = (await api<{ id: string }>(page, 'POST', base, {
    title,
    premise: 'Private premise: the narrator lies.',
    status: 1,
  }))!.id
  const scenes: string[] = []
  for (const [sceneTitle, summary] of [
    ['Harbour at dawn', 'The boats come back empty.'],
    ['Secret cellar', 'Private outline: the keeper hides the ledger.'],
    ['Last bell', 'The tide turns.'],
  ]) {
    scenes.push(
      (await api<{ id: string }>(page, 'POST', `${base}/${id}/scenes`, {
        title: sceneTitle,
        summary,
        notes: 'Private notes',
      }))!.id,
    )
  }
  for (const [scene, text] of [
    [scenes[0], 'The bell rang twice.\n\nNobody answered it.'],
    [scenes[1], 'Private prose nobody may read.'],
  ]) {
    await api(page, 'PUT', `${base}/${id}/scenes/${scene}/manuscript`, {
      content: text,
      expectedVersion: 0,
    })
  }
  const arc = (await api<{ id: string }>(page, 'POST', `${base}/${id}/plot-arcs`, {
    title: 'The Keeper Lies',
    description: 'Spoiler: the keeper drowned the town.',
  }))!.id
  await api(page, 'POST', `${base}/${id}/plot-arcs/${arc}/beats`, { title: 'The ledger surfaces' })
  await api(page, 'PUT', `${base}/${id}/publication`, { publicSummary: 'Seven nights and a tide.' })
  if (publish) await api(page, 'POST', `${base}/${id}/publish`)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return { id, slug, scenes, arc }
}

async function worldSlug(page: Page, w: World) {
  return (await api<{ publicSlug: string | null }>(
    page,
    'GET',
    `/api/universes/${w.id}/publication`,
  ))!.publicSlug
}

async function reader(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

/** A story part's pill, by what it is and whose. */
function scenePill(page: Page, title: string) {
  return page.locator('[data-testid="scene"]', { hasText: title }).getByTestId('scene-publication')
}

test.describe('publishing inside a story', () => {
  test('parts are private until chosen, selected until the story is public, and readers see only them, in order', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const w = await world(page, unique('Ione '), false)
    const s = await story(page, w, unique('The Long Ebb '), false)
    const storyPage = `/app/universes/${w.id}/stories/${s.id}`

    // Private by default; chosen while the story is private, a part is Selected, never Public.
    await page.goto(storyPage)
    await expect(scenePill(page, 'Harbour at dawn')).toContainText('Private')
    await scenePill(page, 'Harbour at dawn').click()
    await expect(page.getByTestId('scene-publication-panel')).toContainText('title and summary')
    await page.getByTestId('publish-scene').click()
    await expect(scenePill(page, 'Harbour at dawn')).toContainText('Selected')
    await scenePill(page, 'Last bell').click()
    await page.getByTestId('publish-scene').click()
    await expect(scenePill(page, 'Last bell')).toContainText('Selected')
    await expect(scenePill(page, 'Secret cellar')).toContainText('Private')

    // Prose is published from the manuscript, beside Save.
    await page.goto(`${storyPage}/manuscript/${s.scenes[0]}`)
    const prose = page.getByTestId('manuscript-publication')
    await expect(prose).toContainText('Private')
    await prose.click()
    await page.getByTestId('publish-manuscript').click()
    await expect(prose).toContainText('Selected')

    // Publishing the story - from its own pill - turns every selected part Public at once.
    await page.goto(storyPage)
    await page.getByTestId('story-publication').click()
    await page.getByTestId('publish-story').click()
    await expect(page.getByTestId('story-publication-state')).toHaveText('Selected')
    await api(page, 'POST', `/api/universes/${w.id}/publish`)
    await page.reload()
    await expect(page.getByTestId('story-publication-state')).toHaveText('Public')
    await expect(scenePill(page, 'Harbour at dawn')).toContainText('Public')
    await expect(scenePill(page, 'Secret cellar')).toContainText('Private')

    const slug = await worldSlug(page, w)
    const address = `/worlds/${slug}/stories/${s.slug}`
    const { context, page: anon } = await reader(browser)

    // Plot is never published by anything around it.
    await anon.goto(address)
    const told = anon.getByTestId('public-story')
    await expect(told.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(told.getByTestId('public-story-scene').locator('h3')).toHaveText([
      'Harbour at dawn',
      'Last bell',
    ])
    await expect(told.getByTestId('public-story-part')).toHaveCount(1)
    await expect(told.getByTestId('public-story-part').locator('p')).toHaveText([
      'The bell rang twice.',
      'Nobody answered it.',
    ])
    await expect(told.getByTestId('public-story-plot')).toHaveCount(0)
    for (const secret of [
      'Secret cellar',
      'Private outline',
      'Private prose',
      'Private notes',
      'Private premise',
      'The Keeper Lies',
      'Spoiler',
    ]) {
      await expect(anon.locator('main')).not.toContainText(secret)
    }

    // An arc, published on purpose from the Plot view, appears with its beats.
    await page.goto(`${storyPage}/plot`)
    await page.getByTestId('arc-publication').click()
    await expect(page.getByTestId('arc-publication-panel')).toContainText('only on purpose')
    await page.getByTestId('publish-arc').click()
    await expect(page.getByTestId('arc-publication')).toContainText('Public')
    await anon.reload()
    await expect(told.getByTestId('public-story-arc').locator('h3')).toHaveText('The Keeper Lies')
    await expect(told.getByTestId('public-story-arc')).toContainText('The ledger surfaces')

    // One heading per level, and sections in the reading order with a way to each.
    await expect(anon.locator('h1')).toHaveCount(1)
    await expect(told.locator('h2')).toHaveText(['Manuscript', 'Scenes', 'Plot'])
    await expect(
      told.getByRole('navigation', { name: 'In this story' }).getByRole('link'),
    ).toHaveText(['Manuscript', 'Scenes', 'Plot'])

    // Making the story private hides every part and clears none; publishing it again brings back exactly those.
    await api(page, 'POST', `/api/universes/${w.id}/stories/${s.id}/unpublish`)
    await anon.reload()
    await expect(anon.getByTestId('story-missing')).toBeVisible()
    await page.goto(storyPage)
    await expect(scenePill(page, 'Harbour at dawn')).toContainText('Selected')
    await api(page, 'POST', `/api/universes/${w.id}/unpublish`)
    await api(page, 'POST', `/api/universes/${w.id}/stories/${s.id}/publish`)
    await anon.reload()
    await expect(anon.getByTestId('story-missing')).toBeVisible()
    await api(page, 'POST', `/api/universes/${w.id}/publish`)
    await anon.reload()
    await expect(told.getByTestId('public-story-scene')).toHaveCount(2)
    await expect(told.getByTestId('public-story-arc')).toHaveCount(1)
    await context.close()
  })

  test('a story with only its summary public draws no empty section and hints at nothing', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page, unique('Wren '), true)
    const s = await story(page, w, unique('Quiet Tide '), true)
    const { context, page: anon } = await reader(browser)
    await anon.goto(`/worlds/${await worldSlug(page, w)}/stories/${s.slug}`)

    const told = anon.getByTestId('public-story')
    await expect(told.getByTestId('public-story-summary')).toHaveText('Seven nights and a tide.')
    await expect(told.locator('h2')).toHaveCount(0)
    await expect(told.getByRole('navigation', { name: 'In this story' })).toHaveCount(0)
    for (const hint of ['Manuscript', 'Scenes', 'Plot', 'private', 'Harbour']) {
      await expect(told).not.toContainText(hint)
    }
    await context.close()
  })
})

test.describe('the Publish page', () => {
  test('its one visibility action is in the page header, says what is missing, and confirms both ways', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await signUp(page)
    const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Unready '),
    }))!.id
    await page.goto(`/app/universes/${id}/publish`)

    const header = page.locator('.pageheader')
    const publish = header.getByRole('button', { name: 'Publish world' })
    await expect(publish).toBeVisible()
    await expect(page.getByRole('button', { name: /^Publish/ })).toHaveCount(1)

    // Not ready: the press opens the problem and takes the focus there.
    await publish.click()
    const problem = page.getByTestId('publication-problem')
    await expect(problem).toBeFocused()
    await expect(problem).toContainText('public summary')

    // Ready: the press opens the confirmation instead.
    await api(page, 'PUT', `/api/universes/${id}/publication`, {
      publicSummary: 'Ready at last.',
      category: 1,
      genres: [2],
    })
    const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
      multipart: {
        file: {
          name: 'art.png',
          mimeType: 'image/png',
          buffer: png(800, 500, (x) => [x % 255, 90, 60]),
        },
      },
    })
    expect(artwork.ok()).toBe(true)
    await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: unique('Ada ') })
    await page.reload()
    await expect(page.getByTestId('publication-ready')).toBeVisible()
    await header.getByRole('button', { name: 'Publish world' }).click()
    await expect(page.getByTestId('publish-confirm')).toBeFocused()
    await page.getByTestId('confirm-publish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Public')

    // Public: Make private in the header, in danger ink, not the primary look - and it asks first.
    const makePrivate = header.getByRole('button', { name: 'Make private' })
    await expect(makePrivate).toHaveClass(/button--danger-quiet/)
    await expect(header.getByTestId('view-public-page')).toBeVisible()
    await makePrivate.click()
    await expect(page.getByTestId('unpublish-confirm')).toBeFocused()
    await expect(page.getByTestId('publication-status')).toContainText('Public')
    await page.getByTestId('confirm-unpublish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Private')
    await expect(header.getByRole('button', { name: 'Publish world' })).toBeVisible()
  })
})

test.describe('attribution', () => {
  test('a world based on another work credits its creator, and its author as curator with their real page', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000)
    await signUp(page)
    const author = unique('Curator ')
    const w = await world(page, author, true)
    await page.goto(`/app/universes/${w.id}/publish`)

    // The fields appear with the box; an empty creator is refused beside its field, with the focus there.
    const box = page.getByTestId('based-on-external-work')
    await expect(page.getByTestId('original-creator')).toHaveCount(0)
    await box.check()
    const creator = page.getByLabel('Original creator or source')
    await expect(creator).toBeVisible()
    await page.getByTestId('save-public-details').click()
    await expect(creator).toBeFocused()
    await expect(creator).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('public-attribution')).toContainText('Name the original creator')

    await creator.fill('  Odile Varnas ')
    await page.getByLabel('Original work (optional)').fill('The Salt Cycle')
    await page.getByTestId('save-public-details').click()
    await expect(page.getByTestId('public-details-saved')).toBeVisible()
    await expect(page.getByTestId('publication-author')).toContainText('Curated on LoreX by')

    const slug = await worldSlug(page, w)
    const { context, page: anon } = await reader(browser)
    await anon.goto(`/worlds/${slug}`)
    const byline = anon.getByTestId('public-world-byline')
    await expect(byline.getByTestId('public-world-original')).toHaveText(
      'Based on works by Odile Varnas · The Salt Cycle',
    )
    await expect(byline).toContainText(`Curated on LoreX by ${author}`)
    await expect(byline.getByTestId('public-world-unofficial')).toContainText('Unofficial')
    // Only the curator is a link, and it leads to their own author page.
    await expect(byline.getByRole('link')).toHaveCount(1)
    await byline.getByRole('link', { name: author }).click()
    await anon.waitForURL(/\/authors\//)
    await expect(anon.getByRole('heading', { level: 1 })).toHaveText(author)

    // Explore credits the original creator on the card, briefly.
    await anon.goto(`/explore?q=${encodeURIComponent(w.name)}`)
    const card = anon.locator('.worldcard').filter({ hasText: w.name })
    await expect(card.getByTestId('worldcard-original')).toHaveText(
      'Based on works by Odile Varnas',
    )
    await expect(card).toContainText(`curated by ${author}`)

    // Unticked, nothing of it is published any more.
    await box.uncheck()
    await page.getByTestId('save-public-details').click()
    await expect(page.getByTestId('public-details-saved')).toBeVisible()
    await anon.goto(`/worlds/${slug}`)
    await expect(anon.getByTestId('public-world-byline')).toHaveText(`by ${author}`)
    await expect(anon.locator('main')).not.toContainText('Odile Varnas')
    await context.close()
  })
})

test.describe('themes, phones and zoom', () => {
  test('the reader, the Publish page and the story pills hold in both themes, on a phone and at 200% zoom', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000)
    await signUp(page)
    const w = await world(page, unique('Mara '), true)
    await api(page, 'PUT', `/api/universes/${w.id}/publication`, {
      publicSummary: 'A drowned coast where the tide keeps count.',
      category: 4,
      genres: [1],
      basedOnExternalWork: true,
      originalCreator: 'Odile Varnas, with a rather long name for a narrow screen',
      originalWork: 'The Salt Cycle and Other Tales of the Drowned Coast',
    })
    const s = await story(page, w, unique('Narrow Tide '), true)
    const base = `/api/universes/${w.id}/stories/${s.id}`
    await api(page, 'POST', `${base}/scenes/${s.scenes[0]}/publish`)
    await api(page, 'POST', `${base}/scenes/${s.scenes[0]}/manuscript/publish`)
    await api(page, 'POST', `${base}/plot-arcs/${s.arc}/publish`)
    const address = `/worlds/${await worldSlug(page, w)}/stories/${s.slug}`

    // 200% zoom on a 1280x720 window is a 640x360 page; phones are 390 and 360 wide.
    const sizes = [
      { width: 390, height: 844 },
      { width: 360, height: 780 },
      { width: 640, height: 360 },
      { width: 1024, height: 768 },
    ]

    for (const theme of ['dark', 'light'] as const) {
      const { context, page: anon } = await reader(browser)
      await anon.addInitScript((chosen) => localStorage.setItem('lorex-theme', chosen), theme)
      await page.addInitScript((chosen) => localStorage.setItem('lorex-theme', chosen), theme)

      for (const size of sizes) {
        await anon.setViewportSize(size)
        await anon.goto(address)
        await expect(anon.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(anon.getByTestId('public-story-part')).toBeVisible()
        await expect(anon.getByTestId('public-story-byline')).toBeVisible()
        await noSidewaysScroll(anon)

        await page.setViewportSize(size)
        await page.goto(`/app/universes/${w.id}/publish`)
        await expect(page.getByRole('button', { name: 'Make private' })).toBeInViewport()
        await noSidewaysScroll(page)

        await page.goto(`/app/universes/${w.id}/stories/${s.id}`)
        await expect(scenePill(page, 'Harbour at dawn')).toBeVisible()
        await noSidewaysScroll(page)

        // The prose's pill lives in the save bar, so it never pushes the prose down.
        await page.goto(`/app/universes/${w.id}/stories/${s.id}/manuscript/${s.scenes[0]}`)
        await expect(page.getByTestId('manuscript-publication')).toBeInViewport()
        await noSidewaysScroll(page)
      }
      await context.close()
    }
  })
})
