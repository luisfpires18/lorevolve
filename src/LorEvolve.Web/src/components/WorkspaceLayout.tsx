import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { t, useI18n } from '../i18n'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { AccountMenu } from './AccountMenu'
import { BrandMark } from './BrandMark'
import { SiteFooter } from './SiteFooter'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'

/** The account-level screen an address is, named as its tab and its title say it. */
function screenName(pathname: string) {
  if (pathname.startsWith('/app/ideas')) return t('shell.workspace.screen.ideas')
  if (pathname.startsWith('/app/projects')) return t('shell.workspace.screen.projects')
  if (pathname.startsWith('/app/profile')) return t('shell.workspace.screen.profile')
  if (pathname.startsWith('/app/ai-changes')) return t('shell.workspace.screen.aiChanges')
  return t('shell.workspace.screen.universes')
}

/**
 * My workspace: the frame of the signed-in, account-level screens - the universes, the account's ideas and the
 * profile - and the one place it is drawn. A layout route, as `PublicLayout` is the portal's, so the three screens
 * cannot drift apart again the way three copies of one header did.
 *
 * The bar says which side of LorEvolve this is and what is on it. The brand leads to LorEvolve's home, as everywhere (031).
 * Then the workspace by name, and its two places, Universes and Ideas, the one that is open marked as the current page - by a
 * rule along the bar's foot as well as by ink, never by colour alone. Profile is not a tab: it is the account's, reached
 * from the account menu, and on it neither tab is current. Explore, the other side of LorEvolve, at the end beside the
 * account; on a phone it leaves the bar, because the account menu's "Go to" already holds it, and the workspace takes a
 * row of its own rather than being squeezed into one.
 *
 * A universe is not drawn in this frame. It is one level deeper and keeps its own rail and sidebar, with All universes
 * at the head of the sidebar as the way back up.
 */
export function WorkspaceLayout() {
  const { pathname } = useLocation()
  useI18n()
  useDocumentTitle(screenName(pathname))

  return (
    <div className="home">
      <header className="workspacebar">
        <Link
          className="home__brand workspacebar__brand"
          to="/"
          aria-label={t('shell.brand.homeLabel')}
          data-testid="home-brand"
        >
          <BrandMark />
          <Wordmark />
        </Link>

        <nav className="workspacebar__nav" aria-label={t('shell.workspace.navLabel')}>
          {/* Shown, not spoken: the landmark's own name already says it. */}
          <span className="workspacebar__context" aria-hidden="true">
            {t('shell.workspace.context')}
          </span>
          <ul className="workspacebar__links">
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app"
                end
                data-testid="workspacebar-universes"
              >
                {t('shell.workspace.universes')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app/projects"
                data-testid="workspacebar-projects"
              >
                {t('shell.workspace.projects')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/app/ideas"
                data-testid="workspacebar-ideas"
              >
                {t('shell.workspace.ideas')}
              </NavLink>
            </li>
          </ul>
        </nav>

        <Link className="workspacebar__explore" to="/" data-testid="home-explore">
          {t('shell.workspace.explore')}
        </Link>
        <AccountMenu variant="bar" />
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
