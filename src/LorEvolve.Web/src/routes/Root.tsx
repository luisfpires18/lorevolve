import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { RequireAdmin, RequireAuth } from '../auth/routes'
import { RouteFocus, SkipLink } from '../components/SkipLink'
import { HistoryLeaveGuard } from '../lib/leaveGuard'
import { ProfileImageProvider } from '../profile/ProfileImageProvider'
import UniverseWorkspace from '../pages/UniverseWorkspace'
import { AdminWorkspace } from '../screens'
import { asScreen } from './screenHolds'
import { publicRoutes } from './publicRoutes'
import { accountRoutes } from './accountRoutes'
import { universeLoreRoutes } from './universeLoreRoutes'
import { universeWorldRoutes } from './universeWorldRoutes'
import { universeProjectRoutes } from './universeProjectRoutes'
import { universeIdeaRoutes } from './universeIdeaRoutes'
import { universeToolRoutes } from './universeToolRoutes'

/** The app's providers and routes, exactly as they are declared - the router below only holds them. */
export function Root() {
  return (
    <AuthProvider>
      {/* Inside the session and outside the routes: every screen that draws an avatar reads the
          same one, and it is read once per signed-in account rather than once per header. */}
      <ProfileImageProvider>
        <HistoryLeaveGuard />
        <SkipLink />
        <RouteFocus />
        <Routes>
          {publicRoutes()}

          <Route element={<RequireAuth />}>
            {accountRoutes()}
            <Route path="/app/universes/:id" element={<UniverseWorkspace />}>
              {universeLoreRoutes()}
              {universeWorldRoutes()}
              {universeProjectRoutes()}
              {universeIdeaRoutes()}
              {universeToolRoutes()}
            </Route>
          </Route>

          {/* LorEvolve Admin (#40): the service's own workspace, for an Admin only. The guard is the door, never the lock -
              every admin request is refused by the server for anyone else. */}
          <Route element={<RequireAdmin />}>
            <Route path="/admin/*" element={asScreen('admin', <AdminWorkspace />)} />
          </Route>

          {/* An address nobody holds: inside the workspace, the universes; anywhere else, the front door (ADR 0069). */}
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProfileImageProvider>
    </AuthProvider>
  )
}
