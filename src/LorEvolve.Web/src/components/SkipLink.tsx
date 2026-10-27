import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** The id of the one `main` every layout draws, and the place the skip link lands. */
export const MAIN_CONTENT_ID = 'main-content'

/**
 * "Skip to main content": first in the tab order on every screen, hidden until focused.
 *
 * Rendered once, above the routes, so no screen carries its own. Activating it moves the focus
 * rather than the address: a `#main-content` in the URL would be a history entry the leave guard
 * and Back would both have to reason about, for a jump that is only about the keyboard.
 */
export function SkipLink() {
  return (
    <a
      className="skiplink"
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        const main = document.getElementById(MAIN_CONTENT_ID)
        if (!main) return
        event.preventDefault()
        main.focus()
      }}
      data-testid="skip-link"
    >
      Skip to main content
    </a>
  )
}

/**
 * Which place in LorEvolve an address is, as far as the keyboard is concerned: the portal, one account-level screen of the
 * workspace, or one universe. Coarser than the address on purpose - moving between a universe's sections, opening an
 * entry, an idea or a portal page, or changing a query string all stay where they are.
 */
function placeOf(pathname: string) {
  const universe = /^\/app\/universes\/([^/]+)/.exec(pathname)
  if (universe) return `universe:${universe[1]}`
  if (pathname.startsWith('/app/ideas')) return 'ideas'
  if (pathname.startsWith('/app/profile')) return 'profile'
  if (pathname.startsWith('/app')) return 'universes'
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return pathname
  return 'portal'
}

/**
 * Moves the focus to the new screen's `main` when the place changes - the portal to the workspace, the universes to a
 * universe or to Profile, a universe back to all of them - so a keyboard or a screen reader starts on what was just
 * opened rather than on a `<body>` the link that was pressed has left behind.
 *
 * Only on a change of place, never on the first screen, and never when the focus is already inside the new `main` (an
 * editor that focused its own first field keeps it). The universe's `main` is drawn only once the universe has been
 * read, so it is waited for. The address changes only once an unsaved-changes question has been answered, so this
 * never runs ahead of one.
 */
export function RouteFocus() {
  const { pathname } = useLocation()
  const place = placeOf(pathname)
  const previous = useRef<string | null>(null)

  useEffect(() => {
    const before = previous.current
    previous.current = place
    if (before === null || before === place) return

    function focusMain() {
      const main = document.getElementById(MAIN_CONTENT_ID)
      if (!main) return false
      if (!main.contains(document.activeElement)) main.focus({ preventScroll: true })
      return true
    }

    if (focusMain()) return
    const observer = new MutationObserver(() => {
      if (focusMain()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [place])

  return null
}
