import { lazyWithPreload, type PreloadableScreen } from './lib/lazyWithPreload'

/*
 * Screens are fetched when they are first opened, not when LorEvolve is.
 *
 * Everything below this comment is a leaf: a screen the author reaches by going somewhere. The
 * shell they go there from - the providers, the guards, the workspace chrome and its overview -
 * is imported directly by `App.tsx`, because making the chrome a chunk of its own would only mean
 * fetching the frame before the frame can say which screen to fetch next. That is the waterfall
 * this split exists to avoid, not to create.
 *
 * `EntityPage` is why this is worth doing: it carries the rich-text editor, which is the largest
 * dependency LorEvolve has and is needed on exactly one screen.
 */
export const AdminWorkspace = lazyWithPreload(() => import('./pages/AdminWorkspace'))
export const AiChangePage = lazyWithPreload(() => import('./pages/AiChangePage'))
export const AiChangesPage = lazyWithPreload(() => import('./pages/AiChangesPage'))
export const CanonPage = lazyWithPreload(() => import('./pages/CanonPage'))
export const ConnectAuthorizePage = lazyWithPreload(() => import('./pages/ConnectAuthorizePage'))
export const EntityPage = lazyWithPreload(() => import('./pages/EntityPage'))
export const ExplorePage = lazyWithPreload(() => import('./pages/ExplorePage'))
export const FamilyTreePage = lazyWithPreload(() => import('./pages/FamilyTreePage'))
export const IdeaBoardPage = lazyWithPreload(() => import('./pages/IdeaBoardPage'))
export const IdeaBoardsPage = lazyWithPreload(() => import('./pages/IdeaBoardsPage'))
export const ForgotPasswordPage = lazyWithPreload(() => import('./pages/ForgotPasswordPage'))
export const IdeaPage = lazyWithPreload(() => import('./pages/IdeaPage'))
export const IdeasPage = lazyWithPreload(() => import('./pages/IdeasPage'))
export const InvitationPage = lazyWithPreload(() => import('./pages/InvitationPage'))
export const LandingPage = lazyWithPreload(() => import('./pages/LandingPage'))
export const LoginPage = lazyWithPreload(() => import('./pages/LoginPage'))
export const LorePage = lazyWithPreload(() => import('./pages/LorePage'))
export const MapPage = lazyWithPreload(() => import('./pages/MapPage'))
export const MapsPage = lazyWithPreload(() => import('./pages/MapsPage'))
export const MassCreatePage = lazyWithPreload(() => import('./pages/MassCreatePage'))
export const ProfilePage = lazyWithPreload(() => import('./pages/ProfilePage'))
export const PublicAuthorPage = lazyWithPreload(() => import('./pages/PublicAuthorPage'))
export const PublicLorePage = lazyWithPreload(() => import('./pages/PublicLorePage'))
export const PublicStoryPage = lazyWithPreload(() => import('./pages/PublicStoryPage'))
export const PublicWorldPage = lazyWithPreload(() => import('./pages/PublicWorldPage'))
export const RegisterPage = lazyWithPreload(() => import('./pages/RegisterPage'))
export const ResetPasswordPage = lazyWithPreload(() => import('./pages/ResetPasswordPage'))
export const StoriesPage = lazyWithPreload(() => import('./pages/StoriesPage'))
export const StoryPage = lazyWithPreload(() => import('./pages/StoryPage'))
export const TimelinePage = lazyWithPreload(() => import('./pages/TimelinePage'))
export const ChronologyPage = lazyWithPreload(() => import('./pages/ChronologyPage'))
export const UniversePublish = lazyWithPreload(() => import('./pages/UniversePublish'))
export const UniverseSettings = lazyWithPreload(() => import('./pages/UniverseSettings'))
export const UniverseTrash = lazyWithPreload(() => import('./pages/UniverseTrash'))
export const UniverseTypes = lazyWithPreload(() => import('./pages/UniverseTypes'))
export const UniversesPage = lazyWithPreload(() => import('./pages/UniversesPage'))
export const WorldRulePage = lazyWithPreload(() => import('./pages/WorldRulePage'))
export const WorldRulesPage = lazyWithPreload(() => import('./pages/WorldRulesPage'))

type Screen = Pick<PreloadableScreen<object>, 'preload'>

/** A universe's sections by their address segment, as the sidebar names them. */
const SECTIONS: Record<string, Screen> = {
  lore: LorePage,
  maps: MapsPage,
  'family-tree': FamilyTreePage,
  timeline: TimelinePage,
  'world-rules': WorldRulesPage,
  chronology: ChronologyPage,
  stories: StoriesPage,
  ideas: IdeasPage,
  canon: CanonPage,
  'ai-changes': AiChangesPage,
  types: UniverseTypes,
  trash: UniverseTrash,
  publish: UniversePublish,
  settings: UniverseSettings,
}

/** One level deeper in a section: an entry, a map, a story, a rule, an idea or a proposal. */
const DEEPER: Record<string, (next: string) => Screen> = {
  lore: (next) => (next === 'mass-create' ? MassCreatePage : EntityPage),
  maps: () => MapPage,
  'family-tree': () => FamilyTreePage,
  'world-rules': () => WorldRulePage,
  stories: () => StoryPage,
  ideas: (next) => (next === 'boards' ? IdeaBoardsPage : IdeaPage),
  'ai-changes': () => AiChangePage,
}

function fetchEarly(screen: Screen | undefined) {
  // A failure is left for the screen itself to meet, where the router's error screen says what to do.
  screen?.preload().catch(() => undefined)
}

/**
 * Starts fetching the code for the screen at this address, so it is here by the time the session and the universe are:
 * a section whose code has arrived opens without a fallback, and so without React's 300 ms hold on one. Called as the app
 * boots, beside the session check. Only the universe's sections and the universes list are known here; any other
 * address loads as it always has.
 */
export function preloadPath(pathname: string) {
  if (pathname.replace(/\/+$/, '') === '/app') return fetchEarly(UniversesPage)
  const match = /^\/app\/universes\/[^/]+\/([^/]+)(?:\/([^/]+))?/.exec(pathname)
  if (!match) return
  const [, section, next] = match
  fetchEarly(next ? DEEPER[section]?.(next) : SECTIONS[section])
}

/** Fetches every section's code and an entry's, so the first visit to each opens without a fallback. */
export function preloadSections() {
  for (const screen of [...Object.values(SECTIONS), EntityPage]) fetchEarly(screen)
}
