import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { SunMoon } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from './AccountMenu'
import { ActionMenu } from './ActionMenu'
import { BrandMark } from './BrandMark'
import { PortalSearch } from './PortalSearch'
import { SiteFooter } from './SiteFooter'
import { ThemeSwitch } from './ThemeSwitch'
import { LanguageSwitch } from './LanguageSwitch'
import { MAIN_CONTENT_ID } from './SkipLink'
import { Wordmark } from './Wordmark'
import { useI18n } from '../i18n'

/**
 * The public portal's frame: its own bar and its own `main`, and none of the workspace's chrome - no rail, no
 * universe sidebar, no search over one universe (ADR 0036). One application with two layouts rather than two
 * applications: the session, the router and the build are shared, so a visitor may be signed in or not and the
 * bar says which way to go - Log in and Create account, or My workspace and their account.
 *
 * Explore is the front door, at `/` (ADR 0069), and the brand leads there from everywhere. Explore is the bar's one
 * named destination, on every width: on a phone it takes a row of its own under the brand and the way in, beside the
 * search.
 *
 * What a visitor sees this side of LorEvolve called is Explore - its one named destination and its landmark's name;
 * "portal" is the architecture's word for it, not the screen's. My workspace is a plain link across, in the same tab:
 * no outward arrow, which would say it opened somewhere else.
 *
 * Logging in from a portal page comes back to the same page (the page is passed as router state, which `returnPath`
 * checks). The workspace is otherwise entered only by choosing My workspace, and signing out from here stays here.
 *
 * The portal follows LorEvolve's one theme (013), in its own look: `.portal` redefines the shared tokens for everything
 * inside it, dark or light, so buttons, notices and menus drawn here follow without a second set of components. The
 * bar is a solid band above every page, holding the brand, Explore, the search (see `PortalSearch`) and the way in.
 * The theme is chosen in the account menu; signed out, where there is no account menu, from Appearance beside Log in.
 * The front door alone ends with the site footer; the reading pages give the whole page to what they show.
 */
export function PublicLayout() {
  const { user, isLoading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const front = location.pathname === '/'
  const here = `${location.pathname}${location.search}`
  const comeBack = { from: here }

  return (
    <div className="portal">
      <header className="portal__bar">
        <Link className="portal__brand" to="/" aria-label={t('shell.brand.homeLabel')}>
          <BrandMark />
          <Wordmark />
        </Link>
        <nav className="portal__nav" aria-label={t('portal.layout.exploreNav')}>
          <NavLink className="portal__link" to="/" end data-testid="portal-explore">
            {t('portal.layout.explore')}
          </NavLink>
        </nav>
        <PortalSearch />
        <div className="portal__session" data-testid="portal-session">
          {isLoading ? null : user ? (
            <>
              <Link
                className="portal__pill portal__workspace"
                to="/app"
                data-testid="portal-workspace"
              >
                {t('portal.layout.workspace')}
              </Link>
              <AccountMenu variant="bar" signedOutTo={here} />
            </>
          ) : (
            <>
              <ActionMenu
                label={t('portal.layout.appearance')}
                trigger={<SunMoon aria-hidden="true" size={18} strokeWidth={1.75} />}
                triggerClassName="portal__appearance"
                panelClassName="portal__appearancepanel"
                triggerTestId="portal-appearance"
              >
                <ThemeSwitch inMenu />
                <LanguageSwitch inMenu />
              </ActionMenu>
              <Link
                className="portal__pill"
                to="/login"
                state={comeBack}
                data-testid="portal-login"
              >
                {t('portal.layout.login')}
              </Link>
              <Link
                className="portal__pill portal__pill--primary"
                to="/register"
                state={comeBack}
                data-testid="portal-join"
              >
                {t('portal.layout.join')}
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="portal__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </main>

      {front ? <SiteFooter /> : null}
    </div>
  )
}
