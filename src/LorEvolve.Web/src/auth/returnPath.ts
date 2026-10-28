/**
 * Where signing in or creating an account goes next: the page the visitor came from, or the workspace.
 *
 * The page travels in router state (`{ from }`), set by `RequireAuth` and by the portal's Log in and Create account
 * links - never in the address, so no link anyone else writes can choose it. It is still checked, because history
 * state can be written by anything running on the page: only a path on this origin is followed, and never the sign-in
 * or registration screens themselves. `//host`, `/\host`, an absolute URL or a `javascript:` one fall back.
 */
export function returnPath(state: unknown, fallback = '/app') {
  const from = (state as { from?: unknown } | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/')) return fallback

  let url: URL
  try {
    url = new URL(from, window.location.origin)
  } catch {
    return fallback
  }

  // The parser is the judge: it is what the browser will do with the string, tabs and backslashes included.
  if (url.origin !== window.location.origin) return fallback
  if (/^\/(?:login|register)\/?$/.test(url.pathname)) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
