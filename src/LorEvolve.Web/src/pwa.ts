/*
  Registration for the installable app shell. The worker itself is `public/sw.js`, and its
  header states what it does and does not cache.

  Registration is production-only on purpose. In development Vite serves unhashed modules
  and rewrites them on every edit, so a cache-first worker would be actively harmful, and
  the end-to-end suite runs against the dev server. `sw.js` is still served in development,
  which lets a test register it deliberately and assert what it refuses to cache.

  The build id rides on the script URL. A new build is a new URL, so the browser installs a new
  worker, which names its cache after that build and deletes the last one's (see sw.js).
*/
import { BUILD_ID } from './lib/buildInfo'

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?build=${encodeURIComponent(BUILD_ID)}`).catch(() => {
      // An install that fails costs nothing: the app is server-backed and needs no worker
      // to run. Only the install prompt is lost, so there is nothing to report.
    })
  })
}
