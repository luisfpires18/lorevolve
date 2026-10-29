# ADR 0017 - LorEvolve installs as an app shell and caches build output only

Status: accepted (2026-09-10)

## Context

Phase 021 made LorEvolve usable on a phone. Installing it - a home-screen entry, its own window,
no browser chrome - is the part of that which is not CSS: it needs a web app manifest, icons a
platform will accept, and, before a browser will offer to install anything, a registered
service worker with a fetch handler.

A service worker is also the single most dangerous file in a frontend. It sits in front of every
request the page makes, it outlives the page, and anything it writes to a cache is on the device
until something deletes it. LorEvolve is server-backed and authenticated: every route past `/login`
is somebody's private worldbuilding, read through a cookie session (ADR 0005) and gated on
ownership in every query (ADR 0006). A worker that "helpfully" cached responses would put a
readable copy of a universe in `CacheStorage`, where it would survive sign-out, survive the
cookie expiring, and be visible to the next person to open the browser.

There is also no offline design. Nothing in the product authors, queues or reconciles a change
made without a network. Caching enough to make the app *appear* to work offline would be a
promise the API cannot keep.

## Decision

**A manifest and icons, hand-written, with no build plugin.** `public/manifest.webmanifest` and
four icon files are static assets Vite copies verbatim. No `vite-plugin-pwa`, no generated
precache manifest, no new dependency: the whole PWA surface is four files a reviewer can read in
a minute, and there is nothing in the build that can silently start caching more.

**One service worker, `public/sw.js`, that caches build output and nothing else.** It handles a
request only when all of these hold: the method is `GET`, the request mode is not `navigate`,
the origin is our own, and the path is either under `/assets/` or a root static file matching a
short extension list. Everything else is not passed to `respondWith` at all, so the browser
handles it exactly as it would with no worker installed.

Stated as the four refusals, because they are the decision:

| Never touched | Why |
| --- | --- |
| `/api/**` and `/health` | Private, per-user, and the API is the authority on all of it |
| Any non-`GET` | A mutation must reach the server or fail visibly, never be absorbed |
| Navigation requests | `index.html` stays fresh, so nobody is stranded on a frontend build that no longer matches the API |
| Cross-origin | Nothing is known about what it holds or who it belongs to |

Cache-first is safe for what remains only because Vite content-hashes it: a changed asset is a
changed URL, so a cached entry can never be the wrong version of anything. That property is
what the policy rests on, not a heuristic about freshness.

**Nothing is precached.** The asset filenames are only known to the build, and a hard-coded
precache list that drifts is worse than a first load that goes to the network. Install does
`skipWaiting()` and nothing more.

**Registration is production-only.** `src/pwa.ts` returns immediately unless
`import.meta.env.PROD`. In development Vite serves unhashed modules and rewrites them on every
edit, so cache-first would serve yesterday's code; the end-to-end suite runs against that dev
server. `sw.js` is still *served* in development, which is what lets `pwa.spec.ts` register it
deliberately and assert what it refuses to keep.

**The update strategy is one constant.** `CACHE_VERSION` in `sw.js`. A new worker calls
`skipWaiting()` on install and `clients.claim()` on activate, and activate deletes every cache
whose name is not the current one. Because navigations are never cached, the next page load
already carries the new asset URLs - so there is no waiting worker to prompt about, no "reload
to update" banner, and no way to be held on stale frontend assets indefinitely.

**Offline is not claimed anywhere.** There is no offline fallback page, no navigation cache and
no background sync. Opening LorEvolve without a network fails the way it does in a normal tab.

## Consequences

- **LorEvolve does not work offline, installed or not.** This is the intended behaviour. An
  installed LorEvolve is the same app in its own window; it is not a local copy of a universe.
- **Nothing authenticated is ever written to device storage by the worker.** `pwa.spec.ts`
  proves it against the real `sw.js` and a real session: it fetches `/api/auth/me`,
  `/api/universes`, one universe, its entities and a `PUT`, then asserts every cache is free of
  `/api` and of navigation documents - and, in the same test, that static assets *were* kept, so
  the assertion cannot pass by the worker having done nothing.
- **Cached asset entries accumulate across deploys within one `CACHE_VERSION`.** Hashed URLs are
  immutable, so old entries are never wrong, only unused. The lever is bumping `CACHE_VERSION`,
  which drops the lot on the next activate. A per-release bump keeps it bounded; forgetting it
  costs a few hundred kilobytes per deploy and nothing else.
- **Installability needs a secure context**, so it works on `localhost` today and will need
  HTTPS in whatever Phase 022 deploys to. Nothing in the app has to change for that.
- **iOS installs are shallower than Android ones** - no install prompt, `display: standalone`
  honoured through `apple-mobile-web-app-capable`, and the home-screen icon taken from
  `apple-touch-icon.png` rather than from the manifest. That is why a PNG apple touch icon
  exists at all.
- **The mark on the icons is the wordmark, not the old `favicon.svg`.** The favicon shipped
  before this phase was a violet bolt from a template - a different palette and a different
  shape from the graphite plate and serif `L` the app has drawn in `styles.css` since the first
  phase. An installed app whose icon is unrelated to the app is a defect, so `icon.svg` draws the
  mark the product already uses and the document now points at it. `favicon.svg` and the
  `icons.svg` sprite - a sheet of Bluesky, Discord, GitHub and X glyphs from the same template -
  were both deleted once a search confirmed nothing referenced either: not the document, not the
  manifest, not the worker, which matches root static files by pattern and names no file at all.

## Amendment: the icon is the owner's artwork (2026-09-12)

Status: accepted

The decision above shipped a drawn stand-in: `icon.svg`, a graphite plate with a struck `X`,
chosen because it was the mark the product already drew and an installed app whose icon is
unrelated to it is a defect. The owner has since supplied the real thing - three interlocking
red rings around a four-point star - so the stand-in is gone and the supplied artwork is the
canonical mark. Nothing about the caching policy changes.

**One source, in one place.** `assets/brand/lorevolve-icon.png`, the owner's file unaltered: 1299 x
1211, 8-bit RGBA, with genuine transparency - every edge pixel is `(0,0,0,0)`, and the
checkerboard a viewer draws behind it is the viewer's. `scripts/render-icons.py` derives every
shipped asset from it and nothing else does. `public/icon.svg` is deleted: the artwork is a
shaded raster, and tracing it into vectors would be redrawing it, which is not this task's to do.
That also ends the SVG favicon - the document now declares PNG favicons at 48, 32 and 16.

**The generator resamples rather than draws.** It no longer reads geometry out of an SVG; it
trims the master to its own alpha bounds, fits it into each canvas at that use's padding,
area-averages it down and writes a PNG. Alpha is premultiplied before averaging, so the
transparent margin cannot bleed a dark fringe into the mark's edges. Still standard library
only: an area average is the right filter for a reduction of four to eighty times, and it is
thirty lines.

**The icons keep the master's transparency; two of them cannot, and say why.** The artwork is
mostly very dark red - 62% of its opaque pixels sit below luminance 40 - so the first cut put
every platform-facing asset on `--paper`, `#f6f2ea`, to keep the whole symbol visible on a dark
surface. Shipped and looked at, that is a pale tile sitting in a dark tab strip: more conspicuous
than the problem it solved. Rendered against a browser's own tab greys at 16px, the transparent
mark is legible anyway - the lit red rings carry the shape and the dark side merges into the
ground, which reads as a lit sphere. So the favicons, the two `any` icons and the in-app mark are
transparent, and the ground survives only where transparency is not a choice: the maskable icon,
which a platform crops to its own shape and fills, and the Apple touch icon, which iOS composites
onto black.

**Paddings are what each platform needs.** The maskable icon keeps the mark inside the middle
62% of the canvas, so Android cropping to a circle of 80% cannot clip it; Apple gets 12%,
because iOS redraws the corners itself; the favicons are cropped to 2-4%, because at 16px a
pixel of margin is a pixel not spent on the rings. The manifest still declares one maskable
icon and two `any` icons, and the maskable claim is now backed by real safe-zone padding.

**`CACHE_VERSION` is bumped, twice.** The icon filenames never change but their bytes have now
changed twice - the new artwork, then the paper tile coming off the favicons - and root static
files are cached by path, so without a bump a browser keeps serving whichever version it saw
first. `v1` to `v2` to `v3`. The policy is untouched; only the version moved.

**Where the symbol appears in the product, and where it deliberately does not.** Large on the
auth plate above the `LorEvolve` wordmark, and small beside that wordmark in the two paper bars.
It is decorative in both - `alt=""` - because the wordmark beside it is the accessible name, and
a screen reader should not say "LorEvolve LorEvolve". The workspace rail keeps its drawn `L`: the symbol
was tried there and at the ~30px a 3.5rem rail allows it reads as a red tangle, and it puts the
only saturated colour in the chrome directly above the universe accent seal, which is the one
thing in the rail that carries meaning.

## Amendment: the installed app opens the portal (2026-09-28, Task 011)

The manifest's `start_url` is `/explore`: launching the installed app opens the public portal, signed in or not, exactly as
`/` does in a browser - the workspace is entered by choosing My workspace. Its `id` stays `/app`, because the id is the
installed app's identity and changing it would orphan every existing install. A deep link the operating system opens is
still that link. Nothing in the worker changed: navigations were never cached, so there is no stale start page to serve.

## Amendment: the manifest is never cached (2026-09-28, UI refinement 014)

The 011 amendment was wrong about the worker. Navigations were never cached, but the manifest was: `STATIC_ROOT_FILE`
matched `*.webmanifest`, and the rule for root static files is cache-first until `CACHE_VERSION` changes. 011 changed
`start_url` without bumping it, so every browser that had run LorEvolve before 011 kept answering the install and every
manifest update check with the old file - `start_url: /app` - from its v3 cache. The installed app therefore kept
launching `/app`, where `RequireAuth` sends a signed-in author to the universes and a signed-out one to Login. That is
the behaviour the owner saw on a real install, with the correct manifest on the server the whole time.

Decision: the worker never touches the web app manifest (`request.destination === 'manifest'` and the `.webmanifest`
extension both refused), and `CACHE_VERSION` is `v4`, whose activation deletes the v3 cache and the stale file in it.
The manifest is served `no-cache` by the host, so every read is the server's. `start_url` stays `/explore` and `id`
stays `/app` - the identity was not the cause, and changing it would orphan existing installs. A second, smaller
contributor is fixed with it: the client's catch-all sent any unknown address to `/app`; it now sends it to `/explore`
(an unknown address under `/app/` still goes to `/app`).

Consequences. An install made before this reaches `/explore` once its browser runs the v4 worker and then performs its
own manifest update check - on Android when the installed app is launched and its last check is old enough (Chrome
checks about daily and applies the update on a later launch), on desktop on a navigation within scope. Reinstalling
applies it at once. What an operating system restores from its recent-apps list is the window it kept, not a launch,
and a link the system hands the app is that link; neither is changed.

## Amendment: the cache follows the build (2026-10-04, refinement 033)

`CACHE_VERSION` is gone. Root files keep their names across builds (the icons twice needed a hand bump to stop browsers
serving old bytes), and a constant somebody must remember to change is the failure that made both bumps necessary.

- **The build names the cache.** Vite fixes a build id once per build (`LOREVOLVE_BUILD_ID`, else `GITHUB_SHA`, else random)
  and `pwa.ts` registers `/sw.js?build=<id>`. A new id is a new script URL, so the browser installs a new worker, which
  caches under `lorevolve-static-<id>` and on activate deletes every other `lorevolve-static-*` cache. Root static files are
  therefore read afresh once per build. The hand-bumped constant this amendment replaces is the "update strategy" above.
- **Unchanged:** what is cached (build output and root static files, cache-first), what never is (`/api`, `/health`,
  navigations, the manifest, non-`GET`, cross-origin), the server's headers (`/assets` immutable, everything else
  `no-cache`), Vite's hashed names, user media, and production-only registration.
- **Bare `/sw.js`**, which only the E2E suite registers against the dev server, caches as `lorevolve-static-unbuilt`.
- **A worker controls the page from `activating`, before its activate handler has swept the old cache.** Anything that
  checks the sweep waits for `activated`; `pwa.spec.ts` does.
- The semantic version (`package.json`, shown as "LorEvolve v0.1.0") is separate: it says which release is running and
  never invalidates anything.

## Amendment: the new mark, black grounds and the launch layer (2026-10-14, 043.5)

**New mark, same pipeline.** The owner's new icon (a crimson star and X in a pale gold ring) replaces
`assets/brand/lorevolve-icon.png`; `scripts/render-icons.py` re-renders every icon, favicon and `brand-mark.png` from it,
unaltered. The grounds that cannot be transparent - maskable and Apple touch - move from paper to black: the new mark was
drawn on black and reads there, and black is now the launch's ground. The maskable padding grows to 22%, because the
mark's diagonal spikes reach the corners of its own box; `pwa.spec.ts` measures that the whole mark stays inside the 80%
circle.

**`background_color` is black.** The platform's launch screen, the launch layer and the launch logo's own ground are one
surface. `theme_color` stays the plate, `#201f1d`.

**The launch layer.** `index.html` draws a black layer with `launch-logo.webp` (encoded from
`assets/brand/lorevolve-logo.png`) before the first paint, but only in the installed app (`display-mode: standalone`, or
iOS's `navigator.standalone`) and once per window (`sessionStorage`). The app starts underneath; `src/lib/launch.ts`
lifts the layer once the logo has arrived and the shell shows no pending plate, about 1.1 s in all, a fade alone under
reduced motion. A CSS failsafe hides it after 10 s if the app never starts. Browser tabs never draw it or fetch the logo.

**Caching.** `.webp` joins the root files the worker keeps per build, so the logo is local on a cold launch and fresh
after each deployment; nothing else changes. An existing install picks up the new manifest and icons when the platform
next refreshes its install - Android does so on its own schedule, iOS keeps the icon of the home-screen shortcut until it
is added again. LorEvolve does not prompt.

## Amendment: the installed app opens the landing page (2026-10-29)

Owner decision: the manifest's `start_url` is `/`, so launching the installed app opens the landing page, signed in or
not, exactly as a browser's front door does; a signed-in author goes on with "Go to my workspace". Supersedes the 011
amendment's `/explore`. `id` stays `/app`, and nothing in the worker changes: the manifest is never cached (014), so an
existing install picks up the new start on its platform's next manifest update check, or at once on reinstall.
