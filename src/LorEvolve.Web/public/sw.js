/*
  LorEvolve service worker.

  It exists for one reason: a page needs a registered worker with a fetch handler before a
  browser will offer to install it. Everything it does beyond that is deliberately small,
  because LorEvolve is a server-backed, authenticated product and there is no offline design.

  What it caches: same-origin GET requests for build output and root static files only.
  Vite gives every built asset a content hash, so those URLs are immutable and cache-first
  is safe - a changed file is a changed URL.

  What it never touches, by construction rather than by convention:

    - /api/** and /health      private, per-user, and often a mutation
    - anything that is not GET
    - navigation requests       so index.html is always fresh and nobody can be stranded
                                on a frontend build that no longer matches the API
    - cross-origin requests
    - the web app manifest      the browser reads the installed app's start_url, scope and
                                id from it; a kept copy froze all three once (UI refinement
                                014), and it is never cached again

  Those requests are not passed to respondWith at all, so the browser handles them exactly
  as it would with no worker installed. Nothing authenticated is ever written to a cache.

  Consequence, stated plainly: LorEvolve does not work offline. Opening it without a network
  fails the same way it does in a normal tab. That is the intended behaviour, not a gap.

  Update policy: none to follow by hand. The app registers this file as /sw.js?build=<id>,
  the id being the build's own (src/lib/buildInfo.ts), and the cache is named after it. A new
  build is a new script URL, so the browser installs a new worker; it takes over immediately
  (skipWaiting plus clients.claim) and deletes every other LorEvolve cache on activate. Root files
  that keep their names across builds - the icons, brand-mark.png, launch-logo.webp - are therefore fetched
  afresh once per build rather than pinned to the first one a browser saw. Since navigations
  are never cached, the next load already carries the new asset URLs, so no update prompt is
  needed.

  Registered without a build id - only a test does that, against the dev server - the cache
  is lorevolve-static-unbuilt, which no production registration can be.
*/

const CACHE_PREFIX = 'lorevolve-static-'
// The same characters vite.config.ts allows, so a hand-made query cannot name some other cache.
const BUILD =
  new URL(self.location.href).searchParams
    .get('build')
    ?.replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 40) || 'unbuilt'
const STATIC_CACHE = `${CACHE_PREFIX}${BUILD}`

/** Build output, plus the handful of static files that live at the web root. */
const STATIC_ROOT_FILE = /^\/[^/]+\.(?:svg|png|webp|ico|woff2?|css)$/

function isCacheableStatic(url) {
  if (url.pathname.startsWith('/api/')) return false
  if (url.pathname === '/health' || url.pathname.startsWith('/health/')) return false
  return url.pathname.startsWith('/assets/') || STATIC_ROOT_FILE.test(url.pathname)
}

self.addEventListener('install', () => {
  // Nothing is precached: the asset names are only known to the build, and a stale
  // precache list is a worse failure than a first load that goes to the network.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          // lorex-static-: the prefix before the rename to LorEvolve (ADR 0067).
          .filter(
            (name) =>
              (name.startsWith(CACHE_PREFIX) || name.startsWith('lorex-static-')) &&
              name !== STATIC_CACHE,
          )
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return
  if (request.mode === 'navigate') return
  if (request.destination === 'manifest') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.origin !== self.location.origin) return
  if (!isCacheableStatic(url)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      const hit = await cache.match(request)
      if (hit) return hit

      const response = await fetch(request)
      // Only a plain, complete, same-origin success is worth keeping. An opaque or
      // partial response tells us nothing about what it holds.
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {
          /* A full or unavailable cache must never break the response. */
        })
      }
      return response
    })(),
  )
})
