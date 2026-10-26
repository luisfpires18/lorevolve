import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * The app shell at the CSS viewports a laptop and a desktop monitor actually give it (issue #57): 1366x768, 1440x900,
 * 1920x1080 and 2560x1440 at 100% zoom, plus a tablet and a phone.
 *
 * What is proved is geometry, not pixels (a snapshot per screen would fail on every copy edit and prove less):
 *
 *   - nothing scrolls sideways on any route at any width;
 *   - every screen starts at the same edge - the title, the search box above it and the content box share one left
 *     edge, the gutter;
 *   - the content box never passes the shared bound, and once the column is wider than the bound the spare width is
 *     split evenly, so a wide monitor shows the same screen a laptop does with margins either side rather than a
 *     screen hugging the left of an empty expanse;
 *   - on an entry the article keeps a reading measure and the picture sits beside it on a desktop, under it on a
 *     tablet or a phone; its tools and status never leave the content box;
 *   - on a desktop the details reach the content edge one column gap from the article, so spare width widens the
 *     details column instead of opening a void beside or after the text;
 *   - and the one thing the owner saw: the entry page at 1920 and at 2560 is the same layout, measured - the same
 *     measure, picture and rhythm, the details column wider on the monitor.
 *
 * Physical screen size and OS scaling are not in play here and cannot be: they change the CSS viewport, which is what
 * these widths are.
 */

const PASSWORD = 'Test-password-123!'

/** The shared bound, in CSS pixels: `--canvas-max`, 100rem at the 16px root. */
const CANVAS_MAX = 1600

const VIEWPORTS = [
  { name: 'laptop 1366x768', width: 1366, height: 768, phone: false, wide: false },
  { name: 'laptop 1440x900', width: 1440, height: 900, phone: false, wide: false },
  { name: 'desktop 1920x1080', width: 1920, height: 1080, phone: false, wide: false },
  { name: 'monitor 2560x1440', width: 2560, height: 1440, phone: false, wide: true },
  { name: 'tablet 1024x768', width: 1024, height: 768, phone: false, wide: false },
  { name: 'phone 390x844', width: 390, height: 844, phone: true, wide: false },
] as const

interface World {
  u: string
  character: string
  entry: string
  story: string
  scene: string
  storage: Awaited<ReturnType<Page['context']>> extends infer C
    ? C extends { storageState: (...args: never) => Promise<infer S> }
      ? S
      : never
    : never
}

interface Box {
  x: number
  y: number
  w: number
  h: number
  pl: number
  pr: number
}

interface Shape {
  overflow: number
  gutter: number
  canvas: Box | null
  search: Box | null
  header: Box | null
  title: Box | null
  entryMain: Box | null
  entryRail: Box | null
  entryMedia: Box | null
  article: Box | null
  tools: Box | null
  canon: Box | null
  bar: Box | null
  /** The entry grid's own column gap, as computed: the only space allowed between the article and its details. */
  entryGap: number | null
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

function article() {
  const sentence =
    'Marcus Coyote rode out of the Reach with nothing but a borrowed horse and an oath he did not remember swearing, ' +
    'and the Order of the Hollow Star keeps its ledgers in red ink, one line for every promise kept.'
  const paragraph = (n: number) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: Array.from({ length: n }, () => sentence).join(' ') }],
  })
  return JSON.stringify({
    type: 'doc',
    content: [
      paragraph(3),
      paragraph(4),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The first oath' }] },
      paragraph(4),
      paragraph(3),
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Aura level 2' }] },
      paragraph(4),
      paragraph(3),
    ],
  })
}

/** One world with a long article and a portrait, made through the API, and the session that owns it. */
async function makeWorld(browser: Browser): Promise<World> {
  const context = await browser.newContext()
  const api = context.request
  const username = unique('shellgeo')
  const registered = await api.post('/api/auth/register', {
    data: { username, email: `${username}@example.test`, password: PASSWORD },
  })
  expect(registered.ok(), await registered.text()).toBe(true)

  const universe = await (
    await api.post('/api/universes', {
      data: {
        name: unique('Coyote Reach '),
        description: 'Red dust and old oaths.',
        accentColor: null,
      },
    })
  ).json()
  const u = universe.id as string
  const types = (await (await api.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id

  async function entry(name: string, aliases: string[] = []) {
    const response = await api.post(`/api/universes/${u}/entities`, {
      data: {
        entityTypeId: character,
        name,
        summary:
          'A drifter sworn to the Order of the Hollow Star, whose aura burns brighter with every oath kept.',
        canonStatus: 2,
        aliases,
        tags: [],
        fields: [],
      },
    })
    expect(response.ok(), await response.text()).toBe(true)
    return (await response.json()).id as string
  }

  const marcus = await entry('Marcus Coyote', ['The Coyote'])
  await entry('Kayle Coyote')
  await entry('Sister Anselm')

  const current = await (await api.get(`/api/universes/${u}/entities/${marcus}/article`)).json()
  const wrote = await api.put(`/api/universes/${u}/entities/${marcus}/article`, {
    data: { content: article(), expectedVersion: current.version },
  })
  expect(wrote.ok(), await wrote.text()).toBe(true)

  const portrait = await api.put(`/api/universes/${u}/entities/${marcus}/image`, {
    multipart: {
      file: {
        name: 'marcus.png',
        mimeType: 'image/png',
        buffer: png(600, 800, (x, y) => [90 + Math.round(x / 5), 50 + Math.round(y / 10), 70]),
      },
    },
  })
  expect(portrait.ok(), await portrait.text()).toBe(true)

  const story = await (
    await api.post(`/api/universes/${u}/stories`, {
      data: { title: 'The Long Oath', premise: 'Marcus rides to break a vow.', status: 1 },
    })
  ).json()
  const scene = await (
    await api.post(`/api/universes/${u}/stories/${story.id}/scenes`, {
      data: {
        title: 'Red dust at noon',
        summary: 'The Coyote arrives.',
        notes: null,
        povEntityId: marcus,
        chronology: null,
        entityIds: [marcus],
      },
    })
  ).json()

  const storage = await context.storageState()
  await context.close()
  return { u, character, entry: marcus, story: story.id, scene: scene.id, storage }
}

/** Every major workspace route, and the account-level ones in their own frame. */
function routes(world: World) {
  const base = `/app/universes/${world.u}`
  return [
    ['Overview', base],
    ['Lore list', `${base}/lore?type=${world.character}`],
    ['Lore article', `${base}/lore/${world.entry}`],
    ['Stories', `${base}/stories`],
    ['Manuscript', `${base}/stories/${world.story}/manuscript/${world.scene}`],
    ['Timeline', `${base}/timeline`],
    ['Canon', `${base}/canon`],
    ['Types', `${base}/types`],
    ['AI changes', `${base}/ai-changes`],
    ['Trash', `${base}/trash`],
    ['Publish', `${base}/publish`],
    ['Settings', `${base}/settings`],
    ['My universes', '/app'],
    ['My ideas', '/app/ideas'],
  ] as const
}

async function shape(page: Page): Promise<Shape> {
  return page.evaluate(() => {
    const box = (selector: string): Box | null => {
      const element = document.querySelector(selector)
      if (!element) return null
      const r = element.getBoundingClientRect()
      const cs = getComputedStyle(element)
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        pl: parseFloat(cs.paddingLeft),
        pr: parseFloat(cs.paddingRight),
      }
    }
    const root = document.documentElement
    return {
      overflow: root.scrollWidth - root.clientWidth,
      gutter: parseFloat(getComputedStyle(root).getPropertyValue('--gutter')) * 16,
      canvas: box('.canvas') ?? box('.home__body'),
      search: box('.unisearch'),
      header: box('.pageheader') ?? box('.entry__head') ?? box('.home__heading'),
      title: box('h1'),
      entryMain: box('.entry__main'),
      entryRail: box('.entry__rail'),
      entryMedia: box('.entry__media'),
      article: box('.article__body'),
      tools: box('.entry__tools'),
      canon: box('.entry__kind .canon'),
      bar: box('.entry__bar'),
      entryGap: (() => {
        const layout = document.querySelector('.entry__layout')
        return layout ? parseFloat(getComputedStyle(layout).columnGap) : null
      })(),
    }
  })
}

async function open(page: Page, url: string) {
  await page.goto(url)
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
  // The entry's picture reserves its shape before it loads, but the layout is only settled once it has.
  if (url.includes('/lore/') && !url.includes('?')) {
    await expect(page.getByTestId('entry-image').locator('img')).toBeVisible()
    await expect(page.locator('.article__body')).toBeVisible()
  }
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: every route starts at one edge, stays inside the bound and never scrolls sideways`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const world = await makeWorld(browser)
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: world.storage,
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    })
    const page = await context.newPage()

    for (const [name, url] of routes(world)) {
      await open(page, url)
      const got = await shape(page)
      const where = `${name} at ${vp.name}`

      expect(got.overflow, `${where} scrolls sideways by ${got.overflow}px`).toBeLessThanOrEqual(1)
      expect(got.canvas, `${where} has no content box`).not.toBeNull()
      expect(got.title, `${where} has no title`).not.toBeNull()

      const canvas = got.canvas!
      const contentLeft = canvas.x + canvas.pl
      const contentWidth = canvas.w - canvas.pl - canvas.pr

      // The screen's head starts at the gutter (a manuscript's title sits beside its way back, inside that head); on a
      // universe's screens so does the search box above it.
      expect(got.header, `${where} has no page header`).not.toBeNull()
      expect(
        Math.abs(got.header!.x - contentLeft),
        `${where}: the header is not on the content edge`,
      ).toBeLessThanOrEqual(1)
      if (got.search) {
        expect(
          Math.abs(got.search.x - contentLeft),
          `${where}: the search box is not on the content edge`,
        ).toBeLessThanOrEqual(1)
      }

      // The bound, and the centring past it. Account screens keep their own narrower bound and were always centred.
      expect(contentWidth, `${where}: the content box is wider than the bound`).toBeLessThanOrEqual(
        CANVAS_MAX + 1,
      )
      expect(canvas.pl, `${where}: the gutter is narrower than the token`).toBeGreaterThanOrEqual(
        got.gutter - 1,
      )
      if (url.startsWith('/app/universes') && canvas.w > CANVAS_MAX + 2 * got.gutter) {
        expect(
          Math.abs(contentWidth - CANVAS_MAX),
          `${where}: the content box is not at the bound`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(canvas.pl - canvas.pr),
          `${where}: the spare width is not split evenly`,
        ).toBeLessThanOrEqual(1)
      } else if (url.startsWith('/app/universes')) {
        expect(
          Math.abs(canvas.pl - got.gutter),
          `${where}: the gutter is not the token`,
        ).toBeLessThanOrEqual(1)
      }

      if (name !== 'Lore article') continue

      // The entry: a reading measure, the picture beside the text on a desktop and under it on narrower screens, and
      // nothing that belongs to the entry outside its content box.
      const contentRight = canvas.x + canvas.w - canvas.pr
      if (vp.width >= 1280) {
        // The details reach the content edge, and nothing but the grid's own gap separates them from the article:
        // spare width goes to the details column, never to empty space on either side of it.
        expect(
          got.entryRail!.x + got.entryRail!.w,
          `${where}: the visible article/details layout leaves unexplained space to its right`,
        ).toBeCloseTo(contentRight, 0)
        expect(
          Math.abs(got.entryRail!.x - (got.entryMain!.x + got.entryMain!.w) - got.entryGap!),
          `${where}: the space between the article and its details is more than the column gap`,
        ).toBeLessThanOrEqual(1)
        // Seen from the reader's side: where the prose ends to where the details begin stays within the article
        // column's own slack (46rem less the measure) plus that gap.
        expect(
          got.entryRail!.x - (got.article!.x + got.article!.w),
          `${where}: the details are cut off from the text they belong to`,
        ).toBeLessThanOrEqual(736 - got.article!.w + got.entryGap! + 1)
      }
      expect(got.article!.w, `${where}: the article lost its measure`).toBeGreaterThanOrEqual(
        Math.min(480, contentWidth - 1),
      )
      expect(
        got.article!.w,
        `${where}: the article is wider than a reading measure`,
      ).toBeLessThanOrEqual(600)
      expect(got.entryMedia, `${where}: no picture`).not.toBeNull()
      if (vp.width >= 1280) {
        expect(
          got.entryRail!.x,
          `${where}: the picture column is not beside the article`,
        ).toBeGreaterThanOrEqual(got.entryMain!.x + got.entryMain!.w)
      } else {
        expect(
          Math.abs(got.entryRail!.x - got.entryMain!.x),
          `${where}: the picture column should sit under the article`,
        ).toBeLessThanOrEqual(1)
        expect(
          got.entryRail!.y,
          `${where}: the picture column should follow the article`,
        ).toBeGreaterThan(got.entryMain!.y)
      }
      for (const [what, part] of [
        ['tools', got.tools],
        ['Canon status', got.canon],
        ['picture', got.entryMedia],
        ['tab bar', got.bar],
      ] as const) {
        expect(part, `${where}: no ${what}`).not.toBeNull()
        expect(
          part!.x + part!.w,
          `${where}: the ${what} leaves the content box`,
        ).toBeLessThanOrEqual(contentRight + 1)
        expect(
          part!.x,
          `${where}: the ${what} starts before the content box`,
        ).toBeGreaterThanOrEqual(contentLeft - 1)
      }
    }

    await context.close()
  })
}

test('the entry keeps its reading measure and its details beside it, reaching the edge, at 1920 and 2560', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const world = await makeWorld(browser)
  const url = `/app/universes/${world.u}/lore/${world.entry}`

  const measured: Record<number, Shape> = {}
  for (const width of [1920, 2560]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1920 ? 1080 : 1440 },
      storageState: world.storage,
    })
    const page = await context.newPage()
    await open(page, url)
    measured[width] = await shape(page)
    await context.close()
  }

  const desktop = measured[1920]
  const monitor = measured[2560]
  const same = (what: string, a: number, b: number, tolerance = 2) =>
    expect(
      Math.abs(a - b),
      `${what} differs between 1920 and 2560 (${a} vs ${b})`,
    ).toBeLessThanOrEqual(tolerance)

  // The same widths...
  same('the article measure', desktop.article!.w, monitor.article!.w)
  same('the text column', desktop.entryMain!.w, monitor.entryMain!.w)
  same('the picture', desktop.entryMedia!.w, monitor.entryMedia!.w)
  // ...the details column takes what the article leaves, so it sits one column gap from the article and reaches the
  // content edge on both - wider on the monitor, never a void between the text and its picture...
  const fromRight = (got: Shape, part: Box) =>
    got.canvas!.x + got.canvas!.w - got.canvas!.pr - (part.x + part.w)
  for (const [which, got] of [
    ['desktop', desktop],
    ['monitor', monitor],
  ] as const) {
    same(`${which} details to the right edge`, fromRight(got, got.entryRail!), 0, 1)
    same(
      `${which} article to details`,
      got.entryRail!.x - (got.entryMain!.x + got.entryMain!.w),
      got.entryGap!,
      1,
    )
  }
  expect(desktop.entryRail!.w, 'the details column did not grow at 1920').toBeGreaterThan(320)
  expect(monitor.entryRail!.w, 'the details column did not grow at 2560').toBeGreaterThanOrEqual(
    desktop.entryRail!.w,
  )
  // ...and the tools and status use that same right edge on both...
  same(
    'tools to the right edge',
    fromRight(desktop, desktop.tools!),
    fromRight(monitor, monitor.tools!),
  )
  same(
    'Canon status to the right edge',
    fromRight(desktop, desktop.canon!),
    fromRight(monitor, monitor.canon!),
  )
  // ...the same vertical rhythm...
  same('the title top', desktop.title!.y, monitor.title!.y)
  same('the tab bar top', desktop.bar!.y, monitor.bar!.y)
  same('the article top', desktop.article!.y, monitor.article!.y)
  // ...and the monitor's spare width split evenly around it.
  expect(monitor.canvas!.pl).toBeGreaterThan(desktop.canvas!.pl)
  same('the monitor margins', monitor.canvas!.pl, monitor.canvas!.pr, 1)
})

test('the details column widens with the content box, without a jump, from a laptop to a monitor', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const world = await makeWorld(browser)
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    storageState: world.storage,
  })
  const page = await context.newPage()
  await open(page, `/app/universes/${world.u}/lore/${world.entry}`)

  // Either side of where the article column fills (about 1460) and of the old 1600 breakpoint, which snapped the
  // picture from 320 to 440 px wide after leaving up to 119 px empty beside it.
  const widths = [1366, 1440, 1500, 1560, 1599, 1600, 1601, 1680, 1920]
  const rows: { width: number; got: Shape }[] = []
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
    rows.push({ width, got: await shape(page) })
  }

  for (const { width, got } of rows) {
    const where = `entry at ${width}`
    const contentRight = got.canvas!.x + got.canvas!.w - got.canvas!.pr
    expect(got.overflow, `${where}: scrolls sideways`).toBeLessThanOrEqual(0)
    expect(
      Math.abs(got.entryRail!.x + got.entryRail!.w - contentRight),
      `${where}: space is left to the right of the details`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(got.entryRail!.x - (got.entryMain!.x + got.entryMain!.w) - got.entryGap!),
      `${where}: the article and its details are more than a column gap apart`,
    ).toBeLessThanOrEqual(1)
    expect(got.article!.w, `${where}: the prose lost its measure`).toBeGreaterThanOrEqual(480)
    expect(got.article!.w, `${where}: the prose outgrew its measure`).toBeLessThanOrEqual(600)
    // Until the article column is full the details keep their 20rem, as on every laptop before.
    if (got.entryMain!.w < 736 - 1) {
      expect(
        Math.abs(got.entryRail!.w - 320),
        `${where}: the details left 20rem early`,
      ).toBeLessThanOrEqual(1)
    }
  }

  // Continuous: between neighbouring widths the details column and the picture grow by no more than the viewport did.
  for (let index = 1; index < rows.length; index++) {
    const before = rows[index - 1]
    const after = rows[index]
    const step = after.width - before.width
    const where = `${before.width} -> ${after.width}`
    for (const [what, a, b] of [
      ['the details column', before.got.entryRail!.w, after.got.entryRail!.w],
      ['the picture', before.got.entryMedia!.w, after.got.entryMedia!.w],
    ] as const) {
      expect(b, `${where}: ${what} shrank as the screen widened`).toBeGreaterThanOrEqual(a - 1)
      expect(
        b - a,
        `${where}: ${what} jumped by ${b - a} px for ${step} px of screen`,
      ).toBeLessThanOrEqual(step + 1)
    }
  }

  await context.close()
})
