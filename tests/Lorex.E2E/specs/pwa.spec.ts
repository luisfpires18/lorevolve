import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * What has to hold for Lorex to be installable, and what the worker is never allowed to do.
 *
 * The second half is the important one. Lorex is server-backed and authenticated, and there
 * is no offline design: a worker that quietly kept a copy of somebody's universe would be a
 * privacy failure dressed as a feature. So the caching policy is asserted here behaviourally,
 * against the real `sw.js`, rather than trusted to the comment at the top of it.
 *
 * The app itself only registers the worker in a production build. These tests register it by
 * hand so the policy can be proved against the dev server the suite already runs, and every
 * registration is torn down again so nothing leaks into another spec.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * Registers the worker - as a production build does, `/sw.js?build=<id>`, when given a build; bare otherwise - and waits
 * until that very script controls the page. A second build replaces the first worker, so "some controller" is not enough.
 */
async function installWorker(page: Page, build?: string) {
  await page.evaluate(
    async (script) => {
      await navigator.serviceWorker.register(script)
      await navigator.serviceWorker.ready
      // In control is not yet done: a worker controls the page from "activating", before its activate handler has swept
      // the last build's cache. "activated" is after.
      const controls = () => {
        const worker = navigator.serviceWorker.controller
        return (worker?.scriptURL.endsWith(script) ?? false) && worker?.state === 'activated'
      }
      // A worker that is active but not yet in control never sees a fetch.
      while (!controls()) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
          // clients.claim() may already have landed between the two checks.
          setTimeout(resolve, 100)
        })
      }
    },
    build ? `/sw.js?build=${build}` : '/sw.js',
  )
}

/** Every URL the worker has put in a cache, across every cache it owns. */
async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys()
    const urls: string[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) urls.push(request.url)
    }
    return urls
  })
}

async function uninstallWorkers(page: Page) {
  await page
    .evaluate(async () => {
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        await registration.unregister()
      }
      for (const name of await caches.keys()) await caches.delete(name)
    })
    .catch(() => {
      /* Nothing to clean up if the page has already gone. */
    })
}

test.describe('installability', () => {
  test('the manifest is served, well formed, and describes Lorex', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBeTruthy()

    const manifest = JSON.parse(await response.text())

    expect(manifest.name).toBe('Lorex')
    expect(manifest.short_name).toBe('Lorex')
    // The portal is the front door (Task 011): launching the installed app opens Explore, signed in or not. The id
    // stays `/app`, which is the installed app's identity - changing it would orphan every existing install.
    expect(manifest.start_url).toBe('/explore')
    expect(manifest.id).toBe('/app')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')

    // The plate for the window's chrome, and black behind the launch: the platform's launch screen, the launch layer
    // and the launch logo's own ground are one surface (043.5).
    expect(manifest.theme_color).toBe('#201f1d')
    expect(manifest.background_color).toBe('#000000')
  })

  test('every icon the manifest declares actually resolves, at the sizes it claims', async ({
    request,
  }) => {
    const manifest = JSON.parse(await (await request.get('/manifest.webmanifest')).text())

    // What a browser needs before it will offer to install: something at least 192px, and
    // something maskable so the platform can crop to its own shape without clipping the mark.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(
      manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable'),
    ).toBeTruthy()

    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const response = await request.get(icon.src)
      expect(response.ok(), `${icon.src} did not resolve`).toBeTruthy()
      expect(response.headers()['content-type'], `${icon.src} served the wrong type`).toContain(
        icon.type.split('/')[1] === 'svg+xml' ? 'svg' : 'png',
      )
      expect(Number(response.headers()['content-length'] ?? 1)).toBeGreaterThan(0)
    }
  })

  test('every install and favicon asset is the Lorex mark, on the ground that use needs', async ({
    page,
    request,
  }) => {
    // `python scripts/render-icons.py` derives all of these from assets/brand/lorex-icon.png.
    // Nothing is asserted about the artwork's shape - it is the owner's, and a pixel-matched
    // expectation would fail the next time they change it. What is asserted is everything a
    // wrong build would get wrong: the size, the ground, and that the mark is actually on it.
    //
    // `transparent` is the default, so the icon sits in whatever tab strip or launcher is
    // behind it rather than as a pale tile in a dark one. The two exceptions are the ones
    // where transparency is not an option: a maskable icon is cropped to a platform shape and
    // filled, and iOS composites a touch icon onto black - so both sit on black, the launch's ground.
    const transparent: Record<string, number> = {
      '/icon-192.png': 192,
      '/icon-512.png': 512,
      '/favicon-48.png': 48,
      '/favicon-32.png': 32,
      '/favicon-16.png': 16,
      '/brand-mark.png': 384,
    }
    const opaque: Record<string, number> = {
      '/icon-maskable-512.png': 512,
      '/apple-touch-icon.png': 180,
    }

    await page.goto('/login')

    async function probe(url: string) {
      const response = await request.get(url)
      expect(response.ok(), `${url} did not resolve`).toBeTruthy()
      expect(response.headers()['content-type'], `${url} is not a PNG`).toContain('png')

      return page.evaluate(async (src) => {
        const image = new Image()
        image.src = src
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, image.width, image.height)

        let clear = 0
        let solid = 0
        let red = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) clear += 1
          if (data[i + 3] > 250) solid += 1
          // The mark is the only red in the artwork; any ground is neutral and warm.
          if (data[i + 3] > 200 && data[i] - data[i + 2] > 40 && data[i + 1] < 140) red += 1
        }

        const pixels = image.width * image.height
        return {
          width: image.width,
          height: image.height,
          corner: [data[0], data[1], data[2], data[3]],
          clearFraction: clear / pixels,
          solidFraction: solid / pixels,
          redFraction: red / pixels,
        }
      }, url)
    }

    for (const [src, size] of Object.entries(transparent)) {
      const shape = await probe(src)

      expect(shape.width, `${src} is the wrong width`).toBe(size)
      expect(shape.height, `${src} is not square`).toBe(size)

      // The corner is nothing at all: no paper tile, and no checkerboard baked into the source.
      expect(shape.corner[3], `${src} has a ground behind the mark`).toBe(0)
      expect(shape.clearFraction, `${src} is not transparent around the mark`).toBeGreaterThan(0.3)

      // And the mark is there. Loose on purpose: enough red to prove the artwork was drawn,
      // not so much that changing the artwork breaks the test.
      expect(shape.redFraction, `${src} carries no mark`).toBeGreaterThan(0.005)
    }

    for (const [src, size] of Object.entries(opaque)) {
      const shape = await probe(src)

      expect(shape.width, `${src} is the wrong width`).toBe(size)
      expect(shape.height, `${src} is not square`).toBe(size)

      // Black, which is also the manifest's background_color. Fully opaque, because a platform
      // mask fills a transparent region and iOS fills it with black.
      expect(shape.corner, `${src} does not sit on the black ground`).toEqual([0, 0, 0, 255])
      expect(shape.solidFraction, `${src} has transparent pixels`).toBe(1)
      expect(shape.redFraction, `${src} carries no mark`).toBeGreaterThan(0.02)
    }
  })

  test('the maskable icon keeps the whole mark inside the safe zone a platform mask leaves', async ({
    page,
  }) => {
    // A platform may crop a maskable icon to any shape that contains the centred circle of 80% of the canvas. Every
    // pixel of the mark - anything brighter than the black ground - has to lie inside that circle, spikes included.
    await page.goto('/login')
    const furthest = await page.evaluate(async () => {
      const image = new Image()
      image.src = '/icon-maskable-512.png'
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      const centre = image.width / 2
      let furthest = 0
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const at = (y * image.width + x) * 4
          if (Math.max(data[at], data[at + 1], data[at + 2]) > 24) {
            furthest = Math.max(furthest, Math.hypot(x + 0.5 - centre, y + 0.5 - centre))
          }
        }
      }
      return furthest / image.width
    })
    expect(furthest, 'the mark reaches past the maskable safe zone').toBeLessThanOrEqual(0.4)
    expect(furthest, 'the mark is too small to read').toBeGreaterThan(0.3)
  })

  test('the document carries the metadata an install and a phone need', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('link[rel=manifest]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
    await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute(
      'href',
      '/apple-touch-icon.png',
    )

    // PNG favicons, at the three sizes a browser picks between. There is no SVG favicon: the
    // mark is raster artwork and tracing it would be redrawing it.
    const favicons = await page.locator('link[rel=icon]').all()
    const hrefs = await Promise.all(favicons.map((link) => link.getAttribute('href')))
    expect(hrefs).toEqual(
      expect.arrayContaining(['/favicon-48.png', '/favicon-32.png', '/favicon-16.png']),
    )
    for (const link of favicons) {
      await expect(link).toHaveAttribute('type', 'image/png')
    }

    // viewport-fit=cover is what makes env(safe-area-inset-*) resolve to anything, and the
    // bottom action bar on a narrow screen pads itself with it.
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('viewport-fit=cover')

    // One theme colour, set for the theme in use (013), so the browser chrome follows the app into dark.
    const themeColors = await page.locator('meta[name=theme-color]').all()
    expect(themeColors.length).toBe(1)
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    await expect(themeColors[0]).toHaveAttribute(
      'content',
      theme === 'dark' ? '#151617' : '#f6f2ea',
    )

    await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute(
      'content',
      'Lorex',
    )
  })

  test('the app does not register a worker in development', async ({ page }) => {
    await page.goto('/login')
    await page.waitForTimeout(500)

    // Vite rewrites unhashed modules on every edit, so a cache-first worker in development
    // would serve yesterday's code. Registration is production-only on purpose.
    const registrations = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    )
    expect(registrations).toBe(0)
  })
})

test.describe('what the worker is allowed to keep', () => {
  test.afterEach(async ({ page }) => {
    await uninstallWorkers(page)
  })

  test('it keeps static assets and never keeps an authenticated API response', async ({ page }) => {
    // A real session, with real private data behind it.
    const username = unique('installer')
    await page.goto('/register')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.test`)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL('/app')

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Private World '))
    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
    const universeId = page.url().split('/').pop()!

    await installWorker(page)

    // Everything private the app talks to: the session, the list, one universe, and a
    // mutation. All of it goes through the worker's fetch handler.
    const statuses = await page.evaluate(async (id) => {
      const paths = [
        '/api/auth/me',
        '/api/universes',
        `/api/universes/${id}`,
        `/api/universes/${id}/entities`,
        '/api/health',
      ]
      const results: Record<string, number> = {}
      for (const path of paths) {
        results[path] = (await fetch(path)).status
      }
      results['PUT /api/universes'] = (
        await fetch(`/api/universes/${id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed World', description: null, accentColor: null }),
        })
      ).status
      return results
    }, universeId)

    // The requests really did happen - a policy proved against requests that never ran
    // would prove nothing.
    expect(statuses['/api/auth/me']).toBe(200)
    expect(statuses['/api/universes']).toBe(200)
    expect(statuses[`/api/universes/${universeId}`]).toBe(200)
    expect(statuses['PUT /api/universes']).toBe(200)

    // And a static asset, which the worker is meant to keep.
    await page.evaluate(async () => {
      await fetch('/favicon-32.png')
      await fetch('/manifest.webmanifest')
    })

    const urls = await cachedUrls(page)

    // The whole point.
    const leaked = urls.filter((url) => new URL(url).pathname.startsWith('/api/'))
    expect(leaked, `the worker cached API responses: ${leaked.join(', ')}`).toEqual([])
    expect(urls.filter((url) => new URL(url).pathname.startsWith('/health'))).toEqual([])

    // Nothing user-specific by any other route either: no navigation documents, so nobody
    // can be stranded on a frontend build that no longer matches the API.
    expect(urls.filter((url) => new URL(url).pathname === '/app')).toEqual([])
    expect(urls.filter((url) => new URL(url).pathname === '/')).toEqual([])

    // What it does keep, so the handler is doing real work rather than nothing at all.
    expect(urls.some((url) => url.endsWith('/favicon-32.png'))).toBeTruthy()
    // Never the manifest (014): the browser reads the installed app's start_url from it, and a kept copy froze
    // `/app` into every install made before Task 011 changed it.
    expect(urls.some((url) => url.endsWith('/manifest.webmanifest'))).toBeFalsy()
  })

  test('an install made before 011 is freed: the old cache with its /app manifest goes, and the manifest is always fresh', async ({
    page,
  }) => {
    await page.goto('/explore')
    // What a browser that ran Lorex before Task 011 still holds: v3's cache, with the manifest that said /app.
    await page.evaluate(async () => {
      const stale = await caches.open('lorex-static-v3')
      await stale.put(
        '/manifest.webmanifest',
        new Response(JSON.stringify({ id: '/app', start_url: '/app' }), {
          headers: { 'Content-Type': 'application/manifest+json' },
        }),
      )
    })

    await installWorker(page)

    // Activation deleted every older cache, the stale manifest with it.
    expect(await page.evaluate(() => caches.keys())).not.toContain('lorex-static-v3')

    // And the worker never answers for the manifest again: every read is the server's, and says /explore.
    const served: boolean[] = []
    page.on('response', (response) => {
      if (response.url().endsWith('/manifest.webmanifest'))
        served.push(response.fromServiceWorker())
    })
    const manifest = await page.evaluate(async () => {
      await fetch('/manifest.webmanifest')
      return (await fetch('/manifest.webmanifest')).json()
    })
    expect(manifest.start_url).toBe('/explore')
    expect(manifest.id).toBe('/app')
    expect(served.length).toBeGreaterThan(0)
    expect(served.every((fromWorker) => !fromWorker)).toBe(true)
    expect((await cachedUrls(page)).some((url) => url.endsWith('.webmanifest'))).toBe(false)
  })

  test('each build keeps its own cache: a new build drops the last one and reads stable root files afresh', async ({
    page,
  }) => {
    await page.goto('/explore')
    const first = `b${Date.now().toString(36)}a`
    const second = `b${Date.now().toString(36)}b`

    // Registered with no build id - only a test does that - the cache can never be a production build's.
    await installWorker(page)
    await page.evaluate(() => fetch('/favicon-16.png'))
    // The worker keeps a copy after answering, not before: wait for it, so it cannot land after the next build's sweep.
    await expect
      .poll(() => page.evaluate(async () => Boolean(await caches.match('/favicon-16.png'))))
      .toBe(true)
    expect(await page.evaluate(() => caches.keys())).toEqual(['lorex-static-unbuilt'])

    // A build: its own cache, and the bare registration's is gone.
    await installWorker(page, first)
    await page.evaluate(() => fetch('/favicon-16.png'))
    expect(await page.evaluate(() => caches.keys())).toEqual([`lorex-static-${first}`])

    // What a browser keeps between deployments for a file that keeps its name: whatever that build cached, served
    // cache-first. A stand-in proves the pin.
    await page.evaluate(async (name) => {
      const cache = await caches.open(name)
      await cache.put(
        '/brand-mark.png',
        new Response('previous build', { headers: { 'Content-Type': 'image/png' } }),
      )
    }, `lorex-static-${first}`)
    expect(await page.evaluate(async () => (await fetch('/brand-mark.png')).text())).toBe(
      'previous build',
    )

    // The next build: a new script URL, a new worker, a new cache, and the old one deleted on activate.
    await installWorker(page, second)
    expect(await page.evaluate(() => caches.keys())).not.toContain(`lorex-static-${first}`)

    // So the stable file comes from the server again - the real mark - and is kept under the new build's name.
    const mark = await page.evaluate(async () => {
      const response = await fetch('/brand-mark.png')
      return {
        type: response.headers.get('content-type'),
        size: (await response.arrayBuffer()).byteLength,
      }
    })
    expect(mark.type).toContain('png')
    expect(mark.size).toBeGreaterThan(1000)
    const kept = await page.evaluate(async (name) => {
      const cache = await caches.open(name)
      return (await cache.keys()).map((request) => new URL(request.url).pathname)
    }, `lorex-static-${second}`)
    expect(kept).toContain('/brand-mark.png')
    expect(await page.evaluate(() => caches.keys())).toEqual([`lorex-static-${second}`])
  })

  test('a navigation is never served from a cache', async ({ page }) => {
    await page.goto('/login')
    await installWorker(page)

    await page.reload()
    await page.waitForTimeout(300)

    const urls = await cachedUrls(page)
    for (const url of urls) {
      const { pathname } = new URL(url)
      expect(
        pathname.endsWith('.html') || pathname === '/' || pathname === '/login',
        `${pathname} looks like a navigation document`,
      ).toBeFalsy()
    }
  })
})
