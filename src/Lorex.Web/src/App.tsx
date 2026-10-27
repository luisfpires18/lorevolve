import { lazy, Suspense, type ReactNode } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Route,
  RouterProvider,
  Routes,
  useRouteError,
} from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ConfirmHost } from './components/ConfirmDialog'
import { RequireAdmin, RequireAuth, RequireGuest } from './auth/routes'
import { PublicLayout } from './components/PublicLayout'
import { RoleGate } from './components/RoleGate'
import { RouteFocus, SkipLink } from './components/SkipLink'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { HistoryLeaveGuard } from './lib/leaveGuard'
import { ProfileImageProvider } from './profile/ProfileImageProvider'
import UniverseOverview from './pages/UniverseOverview'
import UniverseWorkspace from './pages/UniverseWorkspace'

/*
 * Screens are fetched when they are first opened, not when Lorex is.
 *
 * Everything below this comment is a leaf: a screen the author reaches by going somewhere. The
 * shell they go there from - the providers, the guards, the workspace chrome and its overview -
 * is imported directly above, because making the chrome a chunk of its own would only mean
 * fetching the frame before the frame can say which screen to fetch next. That is the waterfall
 * this split exists to avoid, not to create.
 *
 * `EntityPage` is why this is worth doing: it carries the rich-text editor, which is the largest
 * dependency Lorex has and is needed on exactly one screen.
 */
const AdminWorkspace = lazy(() => import('./pages/AdminWorkspace'))
const AiChangePage = lazy(() => import('./pages/AiChangePage'))
const AiChangesPage = lazy(() => import('./pages/AiChangesPage'))
const CanonPage = lazy(() => import('./pages/CanonPage'))
const ConnectAuthorizePage = lazy(() => import('./pages/ConnectAuthorizePage'))
const EntityPage = lazy(() => import('./pages/EntityPage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const FamilyTreePage = lazy(() => import('./pages/FamilyTreePage'))
const IdeaBoardPage = lazy(() => import('./pages/IdeaBoardPage'))
const IdeaBoardsPage = lazy(() => import('./pages/IdeaBoardsPage'))
const IdeaPage = lazy(() => import('./pages/IdeaPage'))
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const InvitationPage = lazy(() => import('./pages/InvitationPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const LorePage = lazy(() => import('./pages/LorePage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const MapsPage = lazy(() => import('./pages/MapsPage'))
const MassCreatePage = lazy(() => import('./pages/MassCreatePage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const PublicAuthorPage = lazy(() => import('./pages/PublicAuthorPage'))
const PublicLorePage = lazy(() => import('./pages/PublicLorePage'))
const PublicStoryPage = lazy(() => import('./pages/PublicStoryPage'))
const PublicWorldPage = lazy(() => import('./pages/PublicWorldPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const StoriesPage = lazy(() => import('./pages/StoriesPage'))
const StoryPage = lazy(() => import('./pages/StoryPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const ChronologyPage = lazy(() => import('./pages/ChronologyPage'))
const UniversePublish = lazy(() => import('./pages/UniversePublish'))
const UniverseSettings = lazy(() => import('./pages/UniverseSettings'))
const UniverseTrash = lazy(() => import('./pages/UniverseTrash'))
const UniverseTypes = lazy(() => import('./pages/UniverseTypes'))
const UniversesPage = lazy(() => import('./pages/UniversesPage'))
const WorldRulePage = lazy(() => import('./pages/WorldRulePage'))
const WorldRulesPage = lazy(() => import('./pages/WorldRulesPage'))

/**
 * Held while a whole screen's code is fetched. The same plate the session probe holds behind
 * (`SessionPending`): the paper the app is about to draw on, so nothing flashes and nothing moves.
 */
function ScreenPending() {
  return <div className="session-pending" role="status" aria-label="Loading this screen" />
}

/** The same hold inside a frame that stays put around it: a universe's rail, sidebar and search, or the workspace bar. */
function SectionPending() {
  return (
    <p className="notice" role="status">
      Opening&hellip;
    </p>
  )
}

/**
 * A screen behind its own boundary, keyed by which screen it is.
 *
 * The key is what makes leaving honest. Without one, React reconciles the outgoing screen against
 * the incoming one, and while the incoming code is still being fetched it holds the outgoing screen
 * on the page - past the moment the address changed, and past the moment an author answered "yes,
 * leave" to an editor's unsaved-changes question. An editor that is still mounted is still guarding,
 * so the browser would ask a second time about a departure already agreed to (`useLeaveGuard`).
 * A changed key unmounts the screen being left in the same commit, exactly as a direct import did.
 *
 * Screens that are one component over several addresses share one key, so they keep their state as
 * they always have: an entry across entries, a story across its scenes, plot and manuscript.
 */
function screen(key: string, hold: ReactNode, page: ReactNode) {
  return (
    <Suspense key={key} fallback={hold}>
      {page}
    </Suspense>
  )
}

const asScreen = (key: string, page: ReactNode) => screen(key, <ScreenPending />, page)
const asSection = (key: string, page: ReactNode) => screen(key, <SectionPending />, page)

/** The app's providers and routes, exactly as they are declared - the router below only holds them. */
function Root() {
  return (
    <AuthProvider>
      {/* Inside the session and outside the routes: every screen that draws an avatar reads the
          same one, and it is read once per signed-in account rather than once per header. */}
      <ProfileImageProvider>
        <HistoryLeaveGuard />
        <SkipLink />
        <RouteFocus />
        <Routes>
          {/* The public portal: outside both guards, so it answers signed in or out, and outside the
              workspace, so none of its chrome is mounted. It reads only the anonymous API (ADR 0036). `/` is
              Lorex's home (031); Explore is where the published worlds are found. */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={asScreen('home', <LandingPage />)} />
            <Route path="/explore" element={asScreen('explore', <ExplorePage />)} />
            <Route path="/worlds/:slug" element={asScreen('world', <PublicWorldPage />)} />
            <Route
              path="/worlds/:slug/lore/:loreSlug"
              element={asScreen('public-lore', <PublicLorePage />)}
            />
            <Route
              path="/worlds/:slug/stories/:storySlug"
              element={asScreen('public-story', <PublicStoryPage />)}
            />
            <Route path="/authors/:authorSlug" element={asScreen('author', <PublicAuthorPage />)} />
          </Route>

          {/* An invitation link: outside both guards, because signed out it must still say what it is - and only that -
              and offer a way in that comes back here (ADR 0041 amendment). */}
          <Route path="/invite/:token" element={asScreen('invite', <InvitationPage />)} />

          <Route element={<RequireGuest />}>
            <Route path="/login" element={asScreen('login', <LoginPage />)} />
            <Route path="/register" element={asScreen('register', <RegisterPage />)} />
          </Route>

          <Route element={<RequireAuth />}>
            {/* An AI app's request to read a universe (ADR 0046), handed here by the authorization endpoint. Signed in,
                because only a member can approve; outside the workspace, because it is a decision, not a place. */}
            <Route
              path="/connect/authorize"
              element={asScreen('connect', <ConnectAuthorizePage />)}
            />
            {/* My workspace's account-level screens share one frame (`WorkspaceLayout`). A universe, below, is a level
                deeper and keeps its own rail and sidebar instead. */}
            <Route element={<WorkspaceLayout />}>
              <Route path="/app" element={asSection('universes', <UniversesPage />)} />
              <Route path="/app/profile" element={asSection('profile', <ProfilePage />)} />
              <Route path="/app/ideas" element={asSection('ideas', <IdeasPage />)} />
              <Route path="/app/ai-changes" element={asSection('ai-changes', <AiChangesPage />)} />
              <Route path="/app/ideas/new" element={asSection('idea', <IdeaPage isNew />)} />
              <Route path="/app/ideas/:ideaId" element={asSection('idea', <IdeaPage />)} />
              <Route path="/app/ideas/boards" element={asSection('ideas', <IdeaBoardsPage />)} />
              <Route
                path="/app/ideas/boards/new"
                element={asSection('board', <IdeaBoardPage isNew />)}
              />
              <Route
                path="/app/ideas/boards/:boardId"
                element={asSection('board', <IdeaBoardPage />)}
              />
            </Route>
            <Route path="/app/universes/:id" element={<UniverseWorkspace />}>
              <Route index element={<UniverseOverview />} />
              <Route path="lore" element={asSection('lore', <LorePage />)} />
              <Route
                path="lore/new"
                element={asSection(
                  'entry',
                  <RoleGate need="editContent">
                    <EntityPage />
                  </RoleGate>,
                )}
              />
              <Route
                path="lore/mass-create"
                element={asSection(
                  'mass-create',
                  <RoleGate need="editContent">
                    <MassCreatePage />
                  </RoleGate>,
                )}
              />
              <Route
                path="lore/:entityId"
                element={asSection(
                  'entry',
                  <RoleGate>
                    <EntityPage />
                  </RoleGate>,
                )}
              />
              <Route
                path="lore/:entityId/progression"
                element={asSection(
                  'entry',
                  <RoleGate>
                    <EntityPage view="progression" />
                  </RoleGate>,
                )}
              />
              <Route
                path="lore/:entityId/relations"
                element={asSection(
                  'entry',
                  <RoleGate>
                    <EntityPage view="relations" />
                  </RoleGate>,
                )}
              />
              <Route
                path="lore/:entityId/history"
                element={asSection(
                  'entry',
                  <RoleGate need="manageHistory">
                    <EntityPage view="history" />
                  </RoleGate>,
                )}
              />
              <Route path="maps" element={asSection('maps', <MapsPage />)} />
              <Route path="maps/:mapId" element={asSection('map', <MapPage />)} />
              <Route path="family-tree" element={asSection('family-tree', <FamilyTreePage />)} />
              <Route
                path="family-tree/:entityId"
                element={asSection('family-tree', <FamilyTreePage />)}
              />
              <Route path="timeline" element={asSection('timeline', <TimelinePage />)} />
              <Route path="world-rules" element={asSection('world-rules', <WorldRulesPage />)} />
              <Route path="chronology" element={asSection('chronology', <ChronologyPage />)} />
              <Route
                path="world-rules/new"
                element={asSection(
                  'rule',
                  <RoleGate need="editContent">
                    <WorldRulePage isNew />
                  </RoleGate>,
                )}
              />
              <Route
                path="world-rules/:ruleId"
                element={asSection(
                  'rule',
                  <RoleGate>
                    <WorldRulePage />
                  </RoleGate>,
                )}
              />
              <Route path="stories" element={asSection('stories', <StoriesPage />)} />
              <Route
                path="stories/:storyId"
                element={asSection('story', <StoryPage view="scenes" />)}
              />
              <Route
                path="stories/:storyId/plot"
                element={asSection('story', <StoryPage view="plot" />)}
              />
              <Route
                path="stories/:storyId/manuscript/:sceneId?"
                element={asSection('story', <StoryPage view="manuscript" />)}
              />
              <Route
                path="stories/:storyId/ideas"
                element={asSection('story', <StoryPage view="ideas" />)}
              />
              <Route
                path="ideas"
                element={asSection(
                  'ideas',
                  <RoleGate need="keepIdeas">
                    <IdeasPage inUniverse />
                  </RoleGate>,
                )}
              />
              <Route
                path="ideas/new"
                element={asSection(
                  'idea',
                  <RoleGate need="keepIdeas">
                    <IdeaPage inUniverse isNew />
                  </RoleGate>,
                )}
              />
              <Route
                path="ideas/:ideaId"
                element={asSection(
                  'idea',
                  <RoleGate need="keepIdeas">
                    <IdeaPage inUniverse />
                  </RoleGate>,
                )}
              />
              <Route
                path="ideas/boards"
                element={asSection(
                  'ideas',
                  <RoleGate need="keepIdeas">
                    <IdeaBoardsPage inUniverse />
                  </RoleGate>,
                )}
              />
              <Route
                path="ideas/boards/new"
                element={asSection(
                  'board',
                  <RoleGate need="keepIdeas">
                    <IdeaBoardPage inUniverse isNew />
                  </RoleGate>,
                )}
              />
              <Route
                path="ideas/boards/:boardId"
                element={asSection(
                  'board',
                  <RoleGate need="keepIdeas">
                    <IdeaBoardPage inUniverse />
                  </RoleGate>,
                )}
              />
              <Route path="canon" element={asSection('canon', <CanonPage />)} />
              <Route
                path="ai-changes"
                element={asSection('ai-changes', <AiChangesPage inUniverse />)}
              />
              <Route
                path="ai-changes/:proposalId"
                element={asSection('ai-change', <AiChangePage />)}
              />
              <Route path="types" element={asSection('types', <UniverseTypes />)} />
              <Route
                path="trash"
                element={asSection(
                  'trash',
                  <RoleGate need="manageTrash">
                    <UniverseTrash />
                  </RoleGate>,
                )}
              />
              <Route
                path="publish"
                element={asSection(
                  'publish',
                  <RoleGate need="publish">
                    <UniversePublish />
                  </RoleGate>,
                )}
              />
              <Route
                path="settings"
                element={asSection(
                  'settings',
                  <RoleGate need="manageUniverse">
                    <UniverseSettings />
                  </RoleGate>,
                )}
              />
            </Route>
          </Route>

          {/* LoreX Admin (#40): the service's own workspace, for an Admin only. The guard is the door, never the lock -
              every admin request is refused by the server for anyone else. */}
          <Route element={<RequireAdmin />}>
            <Route path="/admin/*" element={asScreen('admin', <AdminWorkspace />)} />
          </Route>

          {/* An address nobody holds: inside the workspace, the universes; anywhere else, Lorex's home (031). */}
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProfileImageProvider>
    </AuthProvider>
  )
}

/**
 * A data router with one catch-all route, and the app's own `<Routes>` inside it unchanged. It is a data router for one
 * reason: only a data router can hold the browser's Back and Forward and put the history back where it was, and unsaved
 * writing needs that (`HistoryLeaveGuard`, ADR 0028). Every route, layout and link resolves as it did under
 * `BrowserRouter`.
 */
const router = createBrowserRouter([{ path: '*', element: <Root />, errorElement: <AppCrashed /> }])

/** A screen's code that no longer exists on the server: the tab predates a deploy and asked for an old chunk. */
function isStaleChunk(error: unknown) {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
      error.message,
    )
  )
}

/**
 * What replaces the app when a screen throws while rendering, instead of the router's developer error page. The usual
 * cause after a deploy is a stale chunk, and a reload is the whole fix; anything else is a bug, and a reload is still
 * the only thing the author can do about it. Unsaved writing is kept by the local drafts (ADR 0028).
 */
function AppCrashed() {
  const error = useRouteError()
  const stale = isStaleChunk(error)
  return (
    <main className="session-pending session-pending--unreachable">
      <div className="notice notice--error" role="alert">
        <p>
          {stale
            ? 'Lorex was updated while this page was open. Reload to continue.'
            : 'Something went wrong on this page. Reload to try again.'}
        </p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
    </>
  )
}
