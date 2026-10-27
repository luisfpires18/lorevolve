import { expect, test, type Browser, type Page, type Request } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { png } from './support/png'

/**
 * A universe's artwork arrives with the universe. Its card's two ids ride on the list row and the detail, so a card
 * and the workspace draw the picture on their first render, and nothing asks `GET /api/universes/{id}/artwork`
 * afterwards - the lookup that used to paint the fallback first and swap the picture in a round trip later. The ids
 * are the owner's alone: a collaborator gets no artwork, as before.
 */

interface Artwork {
  assetId: string
  cardId: string
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('artload')
  const email = `${username}@example.test`
  const password = makeTestPassword()
  const registered = await page.request.post('/api/auth/register', {
    data: { username, email, password },
  })
  expect(registered.ok(), await registered.text()).toBe(true)
  const signedIn = await page.request.post('/api/auth/login', {
    data: { usernameOrEmail: username, password },
  })
  expect(signedIn.ok()).toBe(true)
  return { username, email }
}

async function universe(page: Page, name = unique('Saltmere ')) {
  const response = await page.request.post('/api/universes', {
    data: { name, description: null, accentColor: '#7a3e9d' },
  })
  expect(response.ok()).toBe(true)
  return { id: ((await response.json()) as { id: string }).id, name }
}

async function upload(page: Page, id: string, rgb: [number, number, number]) {
  const response = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: { name: 'art.png', mimeType: 'image/png', buffer: png(800, 500, () => rgb) },
    },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as Artwork
}

const cardUrl = (id: string, artwork: Artwork) =>
  `/api/universes/${id}/artwork/${artwork.assetId}/card/${artwork.cardId}`

/** The owner's artwork lookup - exactly that path, never the card or original binary routes beneath it. */
const isArtworkLookup = (request: Request) =>
  request.method() === 'GET' &&
  /^\/api\/universes\/[0-9a-f-]{36}\/artwork$/.test(new URL(request.url()).pathname)

function countLookups(page: Page) {
  const lookups: string[] = []
  page.on('request', (request) => {
    if (isArtworkLookup(request)) lookups.push(request.url())
  })
  return lookups
}

/**
 * What the page looked like the moment each card and the atmosphere were first put on screen, recorded in the page
 * itself, before any later render could change it.
 */
async function recordFirstRenders(page: Page) {
  await page.addInitScript(() => {
    const seen = new WeakSet<Element>()
    const record = ((window as unknown as { __first: Record<string, unknown> }).__first = {
      cards: {} as Record<string, string | null>,
      atmosphere: [] as string[],
    })
    new MutationObserver(() => {
      document.querySelectorAll('[data-testid="universe-card"]').forEach((card) => {
        if (seen.has(card)) return
        seen.add(card)
        ;(record.cards as Record<string, string | null>)[card.getAttribute('data-universe-name')!] =
          card.querySelector('img.plate__image')?.getAttribute('src') ?? null
      })
      const atmosphere = document.querySelector('[data-testid="workspace-atmosphere"]')
      const source = atmosphere?.getAttribute('data-source')
      const sources = record.atmosphere as string[]
      if (source && sources[sources.length - 1] !== source) sources.push(source)
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-source'],
    })
  })
  return {
    cards: () =>
      page.evaluate(
        () =>
          (window as unknown as { __first: { cards: Record<string, string | null> } }).__first
            .cards,
      ),
    atmosphere: () =>
      page.evaluate(
        () => (window as unknown as { __first: { atmosphere: string[] } }).__first.atmosphere,
      ),
  }
}

/**
 * Whether a binary request actually reached the server. Playwright's `request` event fires for a resource Chromium
 * answers from its own cache too, so the cache is read from the DevTools protocol instead.
 */
async function serverHits(page: Page, pathPart: string) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const urls = new Map<string, string>()
  const cached = new Set<string>()
  let reached = 0
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.includes(pathPart)) urls.set(event.requestId, event.request.url)
  })
  cdp.on('Network.requestServedFromCache', (event) => cached.add(event.requestId))
  cdp.on('Network.responseReceived', (event) => {
    if (!urls.has(event.requestId)) return
    if (!event.response.fromDiskCache && !cached.has(event.requestId)) reached++
  })
  return () => reached
}

async function atmosphereOf(page: Page) {
  const atmosphere = page.getByTestId('workspace-atmosphere')
  return {
    source: await atmosphere.getAttribute('data-source'),
    style: (await atmosphere.getAttribute('style')) ?? '',
  }
}

async function share(browser: Browser, owner: Page, universeId: string, role: number) {
  const context = await browser.newContext()
  const member = await context.newPage()
  const { email } = await account(member)
  const invited = await owner.request.post(`/api/universes/${universeId}/invitations`, {
    data: { email, role },
  })
  expect(invited.ok()).toBe(true)
  const { claimToken } = (await invited.json()) as { claimToken: string }
  expect(
    (
      await member.request.post(`/api/invitations/claim/${encodeURIComponent(claimToken)}/accept`)
    ).ok(),
  ).toBe(true)
  return { context, member }
}

test.describe('universe artwork arrives with the universe', () => {
  test('every owned card has its picture on its first render and nothing looks the artwork up', async ({
    page,
  }) => {
    await account(page)
    const worlds = []
    for (const rgb of [
      [200, 60, 60],
      [60, 160, 90],
      [60, 90, 200],
    ] as [number, number, number][]) {
      const world = await universe(page)
      worlds.push({ ...world, artwork: await upload(page, world.id, rgb) })
    }
    const bare = await universe(page)

    const first = await recordFirstRenders(page)
    const lookups = countLookups(page)
    await page.goto('/app')
    await expect(page.getByTestId('universe-card')).toHaveCount(4)

    const cards = await first.cards()
    for (const world of worlds) {
      expect(cards[world.name]).toBe(cardUrl(world.id, world.artwork))
      await expect(
        page.locator(`[data-universe-name="${world.name}"] img.plate__image`),
      ).toHaveJSProperty('naturalWidth', 800)
    }

    // Without artwork: the world's own colour and its initial, as always.
    expect(cards[bare.name]).toBeNull()
    const plain = page.locator(`[data-universe-name="${bare.name}"]`)
    await expect(plain.locator('img')).toHaveCount(0)
    await expect(plain.locator('.plate__art')).toHaveAttribute('data-initial', 'S')

    // And again after a refresh, from the cache.
    await page.reload()
    await expect(page.getByTestId('universe-card')).toHaveCount(4)
    expect((await first.cards())[worlds[0].name]).toBe(cardUrl(worlds[0].id, worlds[0].artwork))

    expect(lookups).toEqual([])
  })

  test('the workspace is ready with the world’s own atmosphere, direct or from its card', async ({
    page,
  }) => {
    await account(page)
    const world = await universe(page)
    const artwork = await upload(page, world.id, [70, 110, 180])
    const lookups = countLookups(page)
    const first = await recordFirstRenders(page)

    // Directly, cold.
    await page.goto(`/app/universes/${world.id}`)
    await expect(page.getByTestId('workspace-name')).toHaveText(world.name)
    expect(await first.atmosphere()).toEqual(['world'])
    expect((await atmosphereOf(page)).style).toContain(cardUrl(world.id, artwork))
    await expect(page.locator('img.sidebar__art')).toHaveAttribute(
      'src',
      cardUrl(world.id, artwork),
    )

    // Refreshed, warm: the picture again from the cache, and still never LorEvolve's first.
    const hits = await serverHits(page, cardUrl(world.id, artwork))
    await page.reload()
    await expect(page.getByTestId('workspace-name')).toHaveText(world.name)
    expect(await first.atmosphere()).toEqual(['world'])
    await expect(page.locator('img.sidebar__art')).toHaveJSProperty('complete', true)
    expect(hits()).toBe(0)

    // From its card: the same address the card already loaded, so nothing reaches the server for it.
    await page.goto('/app')
    const card = page.locator(`[data-universe-name="${world.name}"]`)
    await expect(card.locator('img.plate__image')).toHaveJSProperty('naturalWidth', 800)
    const fromCard = await serverHits(page, cardUrl(world.id, artwork))
    await card.click()
    await expect(page.getByTestId('workspace-name')).toHaveText(world.name)
    expect(await first.atmosphere()).toEqual(['world'])
    await expect(page.locator('img.sidebar__art')).toHaveAttribute(
      'src',
      cardUrl(world.id, artwork),
    )
    await expect(page.locator('img.sidebar__art')).toHaveJSProperty('complete', true)
    expect(fromCard()).toBe(0)

    expect(lookups).toEqual([])
  })

  test('a world without artwork is ready with LorEvolve’s atmosphere, settled', async ({ page }) => {
    await account(page)
    const world = await universe(page)
    const first = await recordFirstRenders(page)

    await page.goto(`/app/universes/${world.id}`)
    await expect(page.getByTestId('workspace-name')).toHaveText(world.name)
    expect(await first.atmosphere()).toEqual(['lorevolve'])
    await expect(page.locator('img.sidebar__art')).toHaveCount(0)
  })

  test('a collaborator is never given the owner’s artwork, on the list or in the workspace', async ({
    page,
    browser,
  }) => {
    await account(page)
    const world = await universe(page)
    const artwork = await upload(page, world.id, [180, 120, 40])

    for (const role of [3, 1]) {
      const { context, member } = await share(browser, page, world.id, role)
      const lookups = countLookups(member)
      const first = await recordFirstRenders(member)

      const listed = (await (await member.request.get('/api/universes')).json()) as {
        items: { id: string; artwork: Artwork | null }[]
      }
      expect(listed.items.find((item) => item.id === world.id)!.artwork).toBeNull()
      const detail = await (await member.request.get(`/api/universes/${world.id}`)).text()
      expect(detail).not.toContain(artwork.assetId)
      expect(detail).not.toContain(artwork.cardId)

      await member.goto('/app')
      const card = member.locator(`[data-universe-name="${world.name}"]`)
      await expect(card.getByTestId('universe-card-role')).toBeVisible()
      await expect(card.locator('img')).toHaveCount(0)

      await card.click()
      await expect(member.getByTestId('workspace-name')).toHaveText(world.name)
      expect(await first.atmosphere()).toEqual(['lorevolve'])
      expect(lookups).toEqual([])
      await context.close()
    }
  })

  test('a reframed or replaced picture is a new address everywhere, and Publish moves the atmosphere at once', async ({
    page,
  }) => {
    await account(page)
    const world = await universe(page)
    const original = await upload(page, world.id, [200, 60, 60])

    const reframing = await page.request.put(`/api/universes/${world.id}/artwork/card`, {
      data: { assetId: original.assetId, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
    })
    expect(reframing.ok()).toBe(true)
    const reframed = (await reframing.json()) as Artwork
    expect(reframed.assetId).toBe(original.assetId)
    expect(reframed.cardId).not.toBe(original.cardId)

    await page.goto('/app')
    await expect(
      page.locator(`[data-universe-name="${world.name}"] img.plate__image`),
    ).toHaveAttribute('src', cardUrl(world.id, reframed))
    await page.goto(`/app/universes/${world.id}/publish`)
    expect((await atmosphereOf(page)).style).toContain(cardUrl(world.id, reframed))

    // Replaced on Publish: the shell follows without a reload, and so does the list after it.
    const section = page.getByTestId('public-portal')
    await section.getByTestId('artwork-input').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: png(800, 500, () => [60, 90, 200]),
    })
    const cropper = page.getByTestId('image-crop-dialog')
    await cropper.getByTestId('image-crop-confirm').click()
    await expect(cropper).toHaveCount(0)
    const stored = (await (
      await page.request.get(`/api/universes/${world.id}/publication`)
    ).json()) as { artwork: Artwork }
    expect(stored.artwork.assetId).not.toBe(original.assetId)
    await expect
      .poll(async () => (await atmosphereOf(page)).style)
      .toContain(cardUrl(world.id, stored.artwork))
    await expect(page.locator('img.sidebar__art')).toHaveAttribute(
      'src',
      cardUrl(world.id, stored.artwork),
    )

    await page.getByRole('link', { name: 'All universes' }).first().click()
    await expect(
      page.locator(`[data-universe-name="${world.name}"] img.plate__image`),
    ).toHaveAttribute('src', cardUrl(world.id, stored.artwork))
  })

  test('on a phone the card and the workspace carry the picture from the start', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await account(page)
    const world = await universe(page)
    const artwork = await upload(page, world.id, [90, 150, 120])
    const lookups = countLookups(page)
    const first = await recordFirstRenders(page)

    await page.goto('/app')
    await expect(page.getByTestId('universe-card')).toHaveCount(1)
    expect((await first.cards())[world.name]).toBe(cardUrl(world.id, artwork))
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)

    await page.locator(`[data-universe-name="${world.name}"]`).click()
    await expect(page.getByTestId('workspace-atmosphere')).toHaveAttribute('data-source', 'world')
    expect(await first.atmosphere()).toEqual(['world'])
    expect(lookups).toEqual([])
    await context.close()
  })

  test('typing waits before searching, and only typing does', async ({ page }) => {
    await account(page)
    const name = unique('Quillmarsh ')
    await universe(page, name)
    await universe(page)

    // Finished requests only: under React's development StrictMode an effect runs twice, and the first one's request is
    // aborted before it is answered.
    const lists: string[] = []
    page.on('requestfinished', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.pathname === '/api/universes') lists.push(url.search)
    })

    await page.goto('/app')
    await expect(page.getByTestId('universe-card')).toHaveCount(2)
    expect(lists).toHaveLength(1)

    // One request for the settled word, not one per keystroke.
    await page.getByLabel('Filter universes').pressSequentially('Quill', { delay: 20 })
    await expect(page.getByTestId('universe-card')).toHaveCount(1)
    await expect(page.getByTestId('universe-card')).toHaveAttribute('data-universe-name', name)
    expect(lists).toHaveLength(2)
    expect(new URLSearchParams(lists[1]).get('search')).toBe('Quill')

    // The archive filter asks at once, with the search it already has.
    await page.getByTestId('filter-all').click()
    await expect.poll(() => lists.length).toBe(3)
    expect(new URLSearchParams(lists[2]).get('includeArchived')).toBe('true')
  })
})
