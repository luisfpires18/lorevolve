import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { returnPath } from './returnPath'
import { useAuth } from './useAuth'

/** Held while the session probe is in flight, so no screen paints before it settles. */
function SessionPending() {
  return <div className="session-pending" role="status" aria-label="Checking your session" />
}

/** Sends signed-out visitors to the sign-in page, remembering where they were headed. */
export function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionPending />
  if (!user)
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  return <Outlet />
}

/**
 * Keeps signed-in people out of the sign-in and registration screens - sending them where those screens would
 * have: the page they came from, else the workspace. The same answer matters, because this guard also sees the
 * session arrive the moment a sign-in succeeds, and must not race the screen's own redirect somewhere else.
 */
export function RequireGuest() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionPending />
  if (user) return <Navigate to={returnPath(location.state)} replace />
  return <Outlet />
}

/**
 * The Admin workspace's door (#40): a signed-in account the server called an Admin, else back to My workspace. Only the
 * entry is hidden here; every admin request is refused by the server for anyone else, whatever this guard decides.
 */
export function RequireAdmin() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionPending />
  if (!user)
    return (
      <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
    )
  if (!user.isAdmin) return <Navigate to="/app" replace />
  return <Outlet />
}
