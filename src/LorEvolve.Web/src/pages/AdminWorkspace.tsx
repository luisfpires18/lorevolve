import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { WorkspaceBar } from '../components/WorkspaceBar'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useI18n } from '../i18n'
import { FeedbackScreen } from '../components/admin/FeedbackScreen'
import { MainScreen } from '../components/admin/MainScreen'
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
      <WorkspaceBar
        navLabel={t('admin.nav.label')}
        context={t('admin.nav.context')}
        testIdPrefix="admin-nav"
        links={[
          { id: 'main', to: '/admin', end: true, label: t('admin.nav.main') },
          { id: 'users', to: '/admin/users', label: t('admin.nav.users') },
          { id: 'feedback', to: '/admin/feedback', label: t('admin.nav.feedback') },
          { id: 'tracing', to: '/admin/tracing', label: t('admin.nav.tracing') },
        ]}
        outbound={{ to: '/app', label: t('admin.nav.myWorkspace'), testId: 'admin-my-workspace' }}
      />

      <main className="home__body" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Routes>
          <Route index element={<MainScreen />} />
          <Route path="users" element={<UsersScreen />} />
          <Route path="users/:userId" element={<UserScreen />} />
          <Route
            path="tracing"
            element={
              <>
                <PageHeader title={t('admin.tracing.title')} lede={t('admin.tracing.lede')} />
                <EmptyState
                  testId="admin-tracing-empty"
                  title={t('admin.tracing.emptyTitle')}
                  hint={t('admin.tracing.emptyHint')}
                />
              </>
            }
          />
          <Route path="feedback" element={<FeedbackScreen />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
