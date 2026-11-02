import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Wordmark } from './Wordmark'
import { IS_DESKTOP, VERSION_LABEL } from '../lib/buildInfo'

/**
 * The foot of LorEvolve's main screens (ADR 0069): where else there is to go, and nothing invented. The wordmark and its
 * line, then the real ways on - Explore, and My workspace or Create account and Log in - above a hairline; under it the
 * year and the running version, neither a link. Drawn by Explore (the front door), My workspace and a universe's column;
 * its colours are the frame's own tokens, so it is night on the portal and paper in the workspace. No Community, Legal
 * or Support group: LorEvolve has no such destination yet, and an empty heading would be worse than none.
 *
 * The wordmark is named by its own word, not "LorEvolve – Home": the bar's brand is the one link of that name on every
 * screen. Inside the workspace the Product group holds Explore alone - a link to the screen you are on says nothing.
 * Nothing is drawn for the session until it is known, so a signed-in visitor never sees Create account flash first.
 */
export function SiteFooter() {
  const { user, isLoading } = useAuth()
  const inWorkspace = useLocation().pathname.startsWith('/app')

  return (
    <footer className="sitefooter" data-testid="portal-footer">
      <div className="sitefooter__top">
        <div className="sitefooter__brand">
          <Link className="sitefooter__home" to="/">
            <Wordmark />
          </Link>
          <p>A workspace for fictional universes</p>
        </div>
        <nav className="sitefooter__nav" aria-labelledby="sitefooter-product">
          <p className="sitefooter__heading" id="sitefooter-product">
            Product
          </p>
          <ul data-testid="portal-footer-links">
            {/* The desktop has no portal; its one way to reach a person is support's address (ADR 0070). */}
            {IS_DESKTOP ? (
              <li>
                <a href="mailto:support@lorevolve.com">Support</a>
              </li>
            ) : (
              <li>
                <Link to="/">Explore</Link>
              </li>
            )}
            {isLoading ? null : user ? (
              inWorkspace ? null : (
                <li>
                  <Link to="/app">My workspace</Link>
                </li>
              )
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
      <div className="sitefooter__base">
        <p data-testid="portal-footer-copyright">©&nbsp;{new Date().getFullYear()} LorEvolve</p>
        <p data-testid="portal-footer-version">{VERSION_LABEL}</p>
      </div>
    </footer>
  )
}
