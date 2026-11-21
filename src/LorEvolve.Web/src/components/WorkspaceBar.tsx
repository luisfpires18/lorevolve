import { Link, NavLink } from 'react-router-dom'
import { useI18n } from '../i18n'
import { AccountMenu } from './AccountMenu'
import { BrandMark } from './BrandMark'
import { Wordmark } from './Wordmark'

export type WorkspaceBarLink = {
  /** The tail of the tab's test id, after `testIdPrefix`. */
  id: string
  to: string
  label: string
  /** Current only on this exact address, not below it (`NavLink`'s `end`). */
  end?: boolean
}

/**
 * The bar of a signed-in workspace that is not a universe: My workspace and LorEvolve Admin (#456 I31). The brand leads
 * home, the tabs mark the open one with `aria-current="page"` (NavLink), one outbound link leaves for the other side, and
 * the account menu closes the row. On a phone the bar takes two rows (`095-bar-2.css`). The page body and any footer
 * stay with the caller.
 */
export function WorkspaceBar({
  navLabel,
  context,
  links,
  outbound,
  testIdPrefix,
  brandTestId,
}: {
  navLabel: string
  /** Shown beside the tabs, not spoken: the landmark's own name already says it. */
  context: string
  links: WorkspaceBarLink[]
  outbound: { to: string; label: string; testId: string }
  testIdPrefix: string
  brandTestId?: string
}) {
  const { t } = useI18n()
  return (
    <header className="workspacebar">
      <Link
        className="home__brand workspacebar__brand"
        to="/"
        aria-label={t('shell.brand.homeLabel')}
        data-testid={brandTestId}
      >
        <BrandMark />
        <Wordmark />
      </Link>

      <nav className="workspacebar__nav" aria-label={navLabel}>
        <span className="workspacebar__context" aria-hidden="true">
          {context}
        </span>
        <ul className="workspacebar__links">
          {links.map((link) => (
            <li key={link.id}>
              <NavLink
                className="workspacebar__link"
                to={link.to}
                end={link.end}
                data-testid={`${testIdPrefix}-${link.id}`}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Link className="workspacebar__explore" to={outbound.to} data-testid={outbound.testId}>
        {outbound.label}
      </Link>
      <AccountMenu variant="bar" />
    </header>
  )
}
