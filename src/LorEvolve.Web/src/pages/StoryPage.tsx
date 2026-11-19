import { useCallback } from 'react'
import { useUniverseAccess } from '../universes/access'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { MoveTarget } from '../components/SceneCard'
import { Visibility } from '../publishing/types'
import { arcNumber, unchaptered as unchapteredLabel } from '../stories/format'
import { chapterChoices, chapterGroups, chapterNumbers, scenesIn } from '../stories/structure'
import type { WorkspaceContext } from './UniverseWorkspace'
import { projectPath } from '../projects/sections'
import { useStoryState, type StoryViewName } from '../stories/useStoryState'
import { useStoryLoad } from '../stories/useStoryLoad'
import { useStoryArrival } from '../stories/useStoryArrival'
import { storyPatches } from '../stories/storyPatches'
import { storySceneMoves } from '../stories/storySceneMoves'
import { storyChapterMoves } from '../stories/storyChapterMoves'
import { storyRemovals } from '../stories/storyRemovals'
import { StoryUnavailable } from '../components/stories/StoryUnavailable'
import { StoryHeader } from '../components/stories/StoryHeader'
import { StoryBar } from '../components/stories/StoryBar'
import { StoryManuscript } from '../components/stories/StoryManuscript'
import { StoryScenes } from '../components/stories/StoryScenes'
import { StoryForms } from '../components/stories/StoryForms'
import { LoadError } from '../components/LoadError'
import { Announce } from '../components/Announce'

/**
 * A story's page, one per story. Moving between its views keeps the page and everything read for it; moving to
 * another story - a search result in another story, say - starts a new page, so nothing on screen for one story (the
 * story itself while the next is read, a message, a pending focus) is ever shown under the other's address, and a link
 * that lands on a scene lands once the story it is in is on screen.
 */
export default function StoryPage({ view = 'scenes' }: { view?: StoryViewName }) {
  const { storyId } = useParams<{ storyId: string }>()
  return <StoryView key={storyId} view={view} />
}

/**
 * One story, told in the order its author sets: arcs, the chapters in each, and the scenes in each chapter (ADR 0070).
 *
 * The page has two views under one header: Scenes, at the story's own address, and Manuscript, at `/manuscript/:sceneId`.
 * Both read the same story, once, so moving between them costs nothing and the header never changes. Neither read
 * carries prose: the Manuscript view reads one scene's text when that scene is opened.
 *
 * The header is deliberately short, because on a phone every line of it stands between the author and the work: the
 * title, one line of facts, the premise on Scenes alone - the story's home - and one bar holding the views and the
 * story's own Edit and Delete. Each view then opens with its own tools, or with one empty state holding the one way to
 * begin.
 *
 * Arcs and chapters are optional. A story without any is one list of scenes, exactly as before chapters existed.
 * Once it has some, the page reads Unchaptered first - a holding area, shown only while it holds a scene - then the
 * chapters in no arc, then each arc in order with its own chapters. Move up and Move down stay inside a scene's chapter,
 * and inside a chapter's arc; Move to… takes either elsewhere. A chapter's number is its position in its arc, drawn here
 * and never stored. A scene's beats are its own, edited in its drawer.
 *
 * No order is chronology. Each scene may say where it happens in the world, and that is shown on the scene, but nothing
 * on this page sorts, groups or warns by it: a story that opens on the aftermath and flashes back to a childhood is
 * exactly as valid as one told straight through.
 */
function StoryView({ view }: { view: StoryViewName }) {
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const { universe, chronology, refreshProjects } = useOutletContext<WorkspaceContext>()
  const { storyId, sceneId } = useParams<{ storyId: string; sceneId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const base = useStoryState()
  const { state, setState, stale, sent, announcement, setReloads, raised, setRaised, publication } =
    base
  const message = raised?.at === location.pathname ? raised.text : null
  useStoryLoad({ ...base, universe, storyId, access })
  useStoryArrival({ ...base, view, location })

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setReloads((count) => count + 1)
  }, [])

  function setMessage(text: string | null) {
    setRaised(text === null ? null : { at: location.pathname, text })
  }

  if (state.kind !== 'ready') {
    return <StoryUnavailable state={state} universe={universe} retry={retry} />
  }

  const story = state.value
  const { arcs, chapters, scenes } = story
  const hasChapters = chapters.length > 0
  const hasStructure = hasChapters || arcs.length > 0
  const isEmpty = !hasStructure && scenes.length === 0
  const unchaptered = scenesIn(scenes, null)
  const groups = chapterGroups(arcs, chapters)
  // The story opens on its first arc and the first chapter on the page, so a folded story still shows where it starts.
  const opensOn = (groups.unarced[0] ?? groups.arcs[0]?.chapters[0])?.id ?? null
  const numbers = chapterNumbers(arcs, chapters)
  const labels = new Map(chapterChoices(arcs, chapters).map((choice) => [choice.id, choice.label]))
  // The story's project views since #194; the old story address redirects there.
  const storyPath = projectPath(story.id, '', universe.id)
  // The universe's one timeline, narrowed to this story: its dated scenes and the moments linked to it.
  const timelinePath = `/app/universes/${universe.id}/timeline?story=${story.id}`

  /** A chapter as a reader finds it: "Chapter 2: Ashes", or "Arc 1, Chapter 2: Ashes" inside an arc. */
  const containerName = (chapterId: string | null) =>
    chapterId === null ? unchapteredLabel() : (labels.get(chapterId) ?? unchapteredLabel())

  const arcIndex = (arcId: string | null) =>
    groups.arcs.findIndex((entry) => entry.arc.id === arcId)

  const targets: MoveTarget[] = hasChapters
    ? [
        { chapterId: null, chapter: null },
        ...[...groups.unarced, ...groups.arcs.flatMap((entry) => entry.chapters)].map(
          (chapter) => ({
            chapterId: chapter.id,
            chapter: { index: (numbers.get(chapter.id) ?? 1) - 1, title: chapter.title },
            arc:
              chapter.plotArcId && arcIndex(chapter.plotArcId) >= 0
                ? arcNumber(arcIndex(chapter.plotArcId))
                : null,
          }),
        ),
      ]
    : []

  const patches = storyPatches({ setState })

  /** Whether anyone can read the story now; null until known, when no part claims to be public. */
  const storyPublication = publication?.storyId === story.id ? publication : null
  const storyIsPublic = storyPublication?.state
    ? storyPublication.state.visibility === Visibility.Public &&
      storyPublication.state.universeIsPublic &&
      storyPublication.state.publicSummary !== null
    : null

  const sceneMoves = storySceneMoves({
    ...base,
    ...patches,
    t,
    universe,
    reload,
    setMessage,
    story,
    scenes,
    hasChapters,
    containerName,
  })

  const chapterMoves = storyChapterMoves({
    ...base,
    ...patches,
    t,
    universe,
    reload,
    setMessage,
    story,
    chapters,
    groups,
    arcIndex,
  })

  const removals = storyRemovals({
    ...base,
    t,
    tx,
    universe,
    refreshProjects,
    navigate,
    reload,
    setMessage,
    story,
    arcs,
    chapters,
    scenes,
    hasChapters,
    groups,
  })

  const shared = {
    ...base,
    access,
    universe,
    chronology,
    story,
    arcs,
    chapters,
    scenes,
    groups,
    targets,
    storyIsPublic,
    opensOn,
    arcIndex,
    hasChapters,
    hasStructure,
    isEmpty,
    unchaptered,
    message,
    storyPath,
    timelinePath,
    storyPublication,
    reload,
    ...patches,
    ...sceneMoves,
    ...chapterMoves,
    ...removals,
  }

  return (
    <article className={`story story--${view}`} data-testid="story-page">
      <StoryHeader {...shared} view={view}>
        <StoryBar {...shared} />
      </StoryHeader>

      {sent ? (
        <p className="callout story__sent" role="status" data-testid="suggestion-sent">
          {t('stories.page.sent')}
        </p>
      ) : null}

      {stale ? (
        <LoadError
          message={t('stories.page.stale')}
          onRetry={reload}
          retryLabel={t('stories.page.staleRetry')}
          testId="story-stale"
          className="story__stale"
        />
      ) : null}

      {view === 'manuscript' ? (
        <StoryManuscript {...shared} sceneId={sceneId} />
      ) : (
        <StoryScenes {...shared} />
      )}

      <Announce testId="story-announcer">{announcement}</Announce>

      <StoryForms {...shared} />
    </article>
  )
}
