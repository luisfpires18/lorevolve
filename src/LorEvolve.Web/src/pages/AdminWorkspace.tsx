import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AccountMenu } from '../components/AccountMenu'
import { BrandMark } from '../components/BrandMark'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useI18n } from '../i18n'
import { FeedbackScreen } from '../components/admin/FeedbackScreen'
import { MainScreen } from '../components/admin/MainScreen'
import { TracingScreen } from '../components/admin/TracingScreen'
import { UserScreen } from '../components/admin/UserScreen'
import { UsersScreen } from '../components/admin/UsersScreen'

/**
 * LorEvolve Admin (#40): the service's own workspace, apart from My workspace and from every universe. Main, Users and
 * Tracing, in My workspace's frame and type. One chunk, fetched only when an Admin opens it; `RequireAdmin` keeps the door
 * and the server refuses every admin request from anyone else.
 *
 * Nothing here reads a universe. Figures are only what LorEvolve records, and what it does not record says so.
 */

function screenTitleKey(pathname: string) {
  if (pathname.startsWith('/admin/users')) return 'admin.documentTitle.users' as const
  if (pathname.startsWith('/admin/tracing')) return 'admin.documentTitle.tracing' as const
  if (pathname.startsWith('/admin/feedback')) return 'admin.documentTitle.feedback' as const
  return 'admin.documentTitle.main' as const
}

export default function AdminWorkspace() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  useDocumentTitle(t(screenTitleKey(pathname)), t('admin.documentTitle.admin'))

  return (
    <div className="home">
      <header className="workspacebar">
        <Link
          className="home__brand workspacebar__brand"
          to="/"
          aria-label={t('shell.brand.homeLabel')}
        >
          <BrandMark />
          <Wordmark />
        </Link>

        <nav className="workspacebar__nav" aria-label={t('admin.nav.label')}>
          <span className="workspacebar__context" aria-hidden="true">
            {t('admin.nav.context')}
          </span>
          <ul className="workspacebar__links">
            <li>
              <NavLink className="workspacebar__link" to="/admin" end data-testid="admin-nav-main">
                {t('admin.nav.main')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/users"
                data-testid="admin-nav-users"
              >
                {t('admin.nav.users')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/feedback"
                data-testid="admin-nav-feedback"
              >
                {t('admin.nav.feedback')}
              </NavLink>
            </li>
            <li>
              <NavLink
                className="workspacebar__link"
                to="/admin/tracing"
                data-testid="admin-nav-tracing"
              >
                {t('admin.nav.tracing')}
              </NavLink>
            </li>
          </ul>
        </nav>

        <Link className="workspacebar__explore" to="/app" data-testid="admin-my-workspace">
          {t('admin.nav.myWorkspace')}
        </Link>
        <AccountMenu variant="bar" />
      </header>

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Routes>
          <Route index element={<MainScreen />} />
          <Route path="users" element={<UsersScreen />} />
          <Route path="users/:userId" element={<UserScreen />} />
          <Route path="tracing" element={<TracingScreen />} />
          <Route path="feedback" element={<FeedbackScreen />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
