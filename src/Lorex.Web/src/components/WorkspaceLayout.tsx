import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { countProposals } from '../aiChanges/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { AccountMenu } from './AccountMenu'
import { BRAND_LINK_LABEL, BrandMark } from './BrandMark'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'

/** The account-level screen an address is, named as its tab and its title say it. */
function screenName(pathname: string) {
  if (pathname.startsWith('/app/ideas')) return 'Ideas'
  if (pathname.startsWith('/app/profile')) return 'Profile'
  if (pathname.startsWith('/app/ai-changes')) return 'Pending AI Changes'
  return 'Universes'
}

/**
 * My workspace: the frame of the signed-in, account-level screens - the universes, the account's ideas and the
 * profile - and the one place it is drawn. A layout route, as `PublicLayout` is the portal's, so the three screens
 * cannot drift apart again the way three copies of one header did.
 *
 * The bar says which side of Lorex this is and what is on it. The brand leads to Lorex's home, as everywhere (031).
 * Then the workspace by name, and its two places, Universes and Ideas, the one that is open marked as the current page - by a
 * rule along the bar's foot as well as by ink, never by colour alone. Profile is not a tab: it is the account's, reached
 * from the account menu, and on it neither tab is current. Explore, the other side of Lorex, at the end beside the
 * account; on a phone it leaves the bar, because the account menu's "Go to" already holds it, and the workspace takes a
 * row of its own rather than being squeezed into one.
 *
 * A universe is not drawn in this frame. It is one level deeper and keeps its own rail and sidebar, with All universes
 * at the head of the sidebar as the way back up.
 */
/** How many proposals wait for the account (ADR 0047), read again on each screen. Nothing shown if it can't be read. */
function useWaitingChanges(pathname: string) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    countProposals(controller.signal)
      .then((answer) => setCount(answer.open))
      .catch(() => {})
    return () => controller.abort()
  }, [pathname])
  return count
}

export function WorkspaceLayout() {
  const { pathname } = useLocation()
  useDocumentTitle(screenName(pathname))
  const waiting = useWaitingChanges(pathname)

  return (
    <div className="home">
      {/* Lorex's own atmosphere behind the bar and the heading; decorative, out of the flow. */}
      <div className="atmosphere" aria-hidden="true" data-source="lorex" />
      <header className="workspacebar">
        <Link
          className="home__brand workspacebar__brand"
          to="/"
          aria-label={BRAND_LINK_LABEL}
          data-testid="home-brand"
        >
          <BrandMark />
          <Wordmark />
        </Link>

        <nav className="workspacebar__nav" aria-label="My workspace">
          {/* Shown, not spoken: the landmark's own name already says it. */}
          <span className="workspacebar__context" aria-hidden="true">
            My workspace
          </span>
          <ul className="workspacebar__links">
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app"
                end
                data-testid="workspacebar-universes"
              >
                Universes
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app/ideas"
                data-testid="workspacebar-ideas"
              >
                Ideas
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app/ai-changes"
                data-testid="workspacebar-ai-changes"
              >
                AI changes
                {waiting > 0 ? (
                  <span className="workspacebar__count" data-testid="workspacebar-ai-changes-count">
                    <span className="visually-hidden">, </span>
                    {waiting}
                    <span className="visually-hidden"> waiting</span>
                  </span>
                ) : null}
              </NavLink>
            </li>
          </ul>
        </nav>

        <Link className="workspacebar__explore" to="/explore" data-testid="home-explore">
          Explore
        </Link>
        <AccountMenu variant="bar" />
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
