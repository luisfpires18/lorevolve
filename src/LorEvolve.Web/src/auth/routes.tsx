import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FeedbackButton } from '../components/FeedbackButton'
import { useI18n } from '../i18n'
import { networkFailure } from '../lib/api'
import { returnPath } from './returnPath'
import { useAuth } from './useAuth'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { SessionPending } from '../components/SessionPending'

/** Held while the session probe is in flight, so no screen paints before it settles. */
function SessionProbe() {
  const { t } = useI18n()
  return <SessionPending label={t('auth.routes.checkingSession')} />
}

/** The session probe could not reach LorEvolve, so whether the author is signed in is unknown: offer a retry. */
function SessionUnreachable({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="session-pending session-pending--unreachable">
      <Callout look="notice" tone="error" role="alert">
        <p>{networkFailure()}</p>
        <Button tone="secondary" onClick={onRetry}>
          {t('auth.routes.retry')}
        </Button>
      </Callout>
    </div>
  )
}

/** Sends signed-out visitors to the sign-in page, remembering where they were headed. */
export function RequireAuth() {
  const { user, isLoading, isUnreachable, retry } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionProbe />
  if (!user && isUnreachable) return <SessionUnreachable onRetry={retry} />
  if (!user)
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  return (
    <>
      <Outlet />
      {/* Report a bug or ask for a feature, from every signed-in page. */}
      <FeedbackButton />
    </>
  )
}

/**
 * Keeps signed-in people out of the sign-in and registration screens - sending them where those screens would
 * have: the page they came from, else the workspace. The same answer matters, because this guard also sees the
 * session arrive the moment a sign-in succeeds, and must not race the screen's own redirect somewhere else.
 */
export function RequireGuest() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionProbe />
  if (user) return <Navigate to={returnPath(location.state)} replace />
  return <Outlet />
}

/**
 * The Admin workspace's door (#40): a signed-in account the server called an Admin, else back to My workspace. Only the
 * entry is hidden here; every admin request is refused by the server for anyone else, whatever this guard decides.
 */
export function RequireAdmin() {
  const { user, isLoading, isUnreachable, retry } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionProbe />
  if (!user && isUnreachable) return <SessionUnreachable onRetry={retry} />
  if (!user)
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  if (!user.isAdmin) return <Navigate to="/app" replace />
  return <Outlet />
}
