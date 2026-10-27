import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { SunMoon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from './AccountMenu'
import { ActionMenu } from './ActionMenu'
import { BRAND_LINK_LABEL, BrandMark } from './BrandMark'
import { PortalSearch } from './PortalSearch'
import { ThemeSwitch } from './ThemeSwitch'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'
import { VERSION_LABEL } from '../lib/buildInfo'

/**
 * The public portal's frame: its own bar and its own `main`, and none of the workspace's chrome - no rail, no
 * universe sidebar, no search over one universe (ADR 0036). One application with two layouts rather than two
 * applications: the session, the router and the build are shared, so a visitor may be signed in or not and the
 * bar says which way to go - Log in and Create account, or My workspace and their account.
 *
 * LorEvolve's home, `/`, is a page of this frame (031), and the brand leads there from everywhere. Explore is the bar's one
 * named destination, on every width: on a phone it takes a row of its own under the brand and the way in, beside the
 * search where there is one.
 *
 * What a visitor sees this side of LorEvolve called is Explore - its one named destination and its landmark's name;
 * "portal" is the architecture's word for it, not the screen's. My workspace is a plain link across, in the same tab:
 * no outward arrow, which would say it opened somewhere else.
 *
 * Logging in from a portal page comes back to the same page (the page is passed as router state, which `returnPath`
 * checks) - except from the home page, whose Log in and Create account mean "let me in", so they land in the workspace
 * as any sign-in does. The workspace is otherwise entered only by choosing My workspace, and signing out from here
 * stays here.
 *
 * The portal follows LorEvolve's one theme (013), in its own look: `.portal` redefines the shared tokens for everything
 * inside it, dark or light, so buttons, notices and menus drawn here follow without a second set of components. The
 * bar is a solid band above every page, holding the brand, Explore, the search (see `PortalSearch`) and the way in. The
 * search is a search of published worlds, so the home page leaves it out: there it would only be a large box asking a
 * newcomer a question before the page has said what LorEvolve is. The theme is chosen in the account menu; signed out,
 * where there is no account menu, from Appearance beside Log in.
 */
export function PublicLayout() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const home = location.pathname === '/'
  const here = `${location.pathname}${location.search}`
  const comeBack = home ? undefined : { from: here }

  return (
    <div className="portal">
      <header className="portal__bar">
        <Link className="portal__brand" to="/" aria-label={BRAND_LINK_LABEL}>
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="portal__nav" aria-label="Explore">
          <NavLink className="portal__link" to="/explore" end data-testid="portal-explore">
            Explore
          </NavLink>
        </nav>
        {home ? null : <PortalSearch />}
        <div className="portal__session" data-testid="portal-session">
          {isLoading ? null : user ? (
            <>
              <Link
                className="portal__pill portal__workspace"
                to="/app"
                data-testid="portal-workspace"
              >
                My workspace
              </Link>
              <AccountMenu variant="bar" signedOutTo={here} />
            </>
          ) : (
            <>
              <ActionMenu
                label="Appearance"
                trigger={<SunMoon aria-hidden="true" size={18} strokeWidth={1.75} />}
                triggerClassName="portal__appearance"
                panelClassName="portal__appearancepanel"
                triggerTestId="portal-appearance"
              >
                <ThemeSwitch inMenu />
              </ActionMenu>
              <Link
                className="portal__pill"
                to="/login"
                state={comeBack}
                data-testid="portal-login"
              >
                Log in
              </Link>
              <Link
                className="portal__pill portal__pill--primary"
                to="/register"
                state={comeBack}
                data-testid="portal-join"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="portal__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>

      {home ? (
        <footer className="portal__footer" data-testid="portal-footer">
          <div className="portal__footertop">
            <div className="portal__footerbrand">
              <Link className="portal__footerhome" to="/" aria-label={BRAND_LINK_LABEL}>
                <Wordmark />
              </Link>
              <p>A workspace for fictional universes</p>
            </div>
            <nav className="portal__footernav" aria-labelledby="portal-footer-product">
              <p className="portal__footerheading" id="portal-footer-product">
                Product
              </p>
              <ul data-testid="portal-footer-links">
                <li>
                  <Link to="/explore">Explore</Link>
                </li>
                {isLoading ? null : user ? (
                  <li>
                    <Link to="/app">My workspace</Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link to="/register">Create account</Link>
                    </li>
                    <li>
                      <Link to="/login">Log in</Link>
                    </li>
                  </>
                )}
              </ul>
            </nav>
          </div>
          <div className="portal__footerbase">
            <p data-testid="portal-footer-copyright">©&nbsp;{new Date().getFullYear()} LorEvolve</p>
            <p data-testid="portal-footer-version">{VERSION_LABEL}</p>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
