import { useCallback, useEffect, useRef, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { BookPlus, FilePenLine, Hourglass, Layers, Pencil, Plus, Trash } from 'lucide-react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { useI18n } from '../i18n'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { ArcSection } from '../components/ArcSection'
import { revealInFolds } from '../components/fold'
import { ContentPublication } from '../components/ContentPublication'
import { ChapterForm } from '../components/ChapterForm'
import { ChapterSection, type ArcTarget } from '../components/ChapterSection'
import { EmptyState } from '../components/EmptyState'
import { IdeasBrowser } from '../components/IdeasBrowser'
import { ManuscriptPanel } from '../components/ManuscriptPanel'
import { PageHeader } from '../components/PageHeader'
import { ReviewComments } from '../components/ReviewComments'
import { PlotArcForm } from '../components/PlotArcForm'
import { SceneCard, type MoveTarget } from '../components/SceneCard'
import { SceneForm } from '../components/SceneForm'
import { StoryForm } from '../components/StoryForm'
import { StoryPartPublication } from '../components/StoryPartPublication'
import { ApiError } from '../lib/api'
import { getContentPublication } from '../publishing/api'
import { Visibility, type ContentPublicationState, type VisibilityValue } from '../publishing/types'
import {
  deleteChapter,
  deletePlotArc,
  deleteScene,
  deleteStory,
  getStory,
  moveChapterToArc,
  moveScene,
  reorderChapters,
  reorderPlotArcs,
  reorderScenes,
  updateScene,
} from '../stories/api'
import {
  arcCountLabel,
  arcLabel,
  arcNumber,
  chapterCountLabel,
  chapterLabel,
  chapterNumber,
  sceneCountLabel,
  unchaptered as unchapteredLabel,
} from '../stories/format'
import { storyChanges } from '../stories/changes'
import {
  chapterChoices,
  chapterGroups,
  chapterNumbers,
  readingOrder,
  scenesIn,
} from '../stories/structure'
import {
  STORY_STATUS_LABELS,
  type Chapter,
  type PlotArc,
  type Scene,
  type StoryDetail,
} from '../stories/types'
import { StatusBadge } from '../components/StatusBadge'
import type { WorkspaceContext } from './UniverseWorkspace'
import { confirmAction } from '../lib/confirm'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; story: StoryDetail }
  | { kind: 'missing' }
  | { kind: 'error' }

type SceneFormState =
  | { mode: 'closed' }
  | { mode: 'new'; chapterId: string | null }
  | { mode: 'edit'; scene: Scene; addBeat?: boolean }
  | { mode: 'suggest'; scene: Scene }

type ChapterFormState =
  | { mode: 'closed' }
  | { mode: 'new'; arcId: string | null }
  | { mode: 'edit'; chapter: Chapter; index: number }

type ArcFormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; arc: PlotArc; index: number }

/** Where the focus goes back to once a scene has moved: its ⋯ menu, wherever the scene now is. */
const sceneMenu = (sceneId: string) => `#scene-${sceneId} [data-testid="scene-actions"]`

/** How long a scene reached by a link stays marked, so the eye can pick it out from its neighbours. */
const ARRIVAL_MS = 2400

type StoryViewName = 'scenes' | 'manuscript' | 'ideas'

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
 * The page has three views under one header: Scenes, at the story's own address, Manuscript, at `/manuscript/:sceneId`,
 * and Ideas, at `/ideas`. All three read the same story, once, so moving between them costs nothing and the header never
 * changes. Neither read carries prose: the Manuscript view reads one scene's text
 * when that scene is opened, and the Ideas view reads one page of the author's own ideas for the story. Ideas are the
 * account's, never the universe's (ADR 0030), so the view is offered only to a member who keeps ideas here - the owner.
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
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const { storyId, sceneId } = useParams<{ storyId: string; sceneId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [stale, setStale] = useState(false)
  const [sceneForm, setSceneForm] = useState<SceneFormState>({ mode: 'closed' })
  const [chapterForm, setChapterForm] = useState<ChapterFormState>({ mode: 'closed' })
  const [arcForm, setArcForm] = useState<ArcFormState>({ mode: 'closed' })
  const [storyForm, setStoryForm] = useState<'closed' | 'edit' | 'suggest'>('closed')
  // A suggestion just sent from this page, said where it can be seen (task 045).
  const [sent, setSent] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [reloads, setReloads] = useState(0)

  // A refusal is held with the address it was raised on, like the manuscript outline's open state, so one raised on
  // the Scenes view is not still standing when the author comes back to it from the Manuscript view.
  const [raised, setRaised] = useState<{ at: string; text: string } | null>(null)
  const message = raised?.at === location.pathname ? raised.text : null

  const isMoving = useRef(false)
  const pendingFocus = useRef<string | null>(null)

  // The story's own publication, read once for the page: its pill shows it, and every part's pill needs to know whether
  // the story is public to say Selected or Public (ADR 0039). Held with the story it was read for.
  const [publication, setPublication] = useState<{
    storyId: string
    state: ContentPublicationState | null
  } | null>(null)

  useEffect(() => {
    // Publication is the owner's (ADR 0041): nobody else is shown a pill, so nobody else asks.
    if (!storyId || !access.publish) return
    const controller = new AbortController()
    getContentPublication(universe.id, 'story', storyId, controller.signal)
      .then((state) => setPublication({ storyId, state }))
      .catch(() => {
        // The story's pill reads it again itself and says so if it cannot; the parts only never claim Public.
        if (!controller.signal.aborted) setPublication({ storyId, state: null })
      })
    return () => {
      controller.abort()
    }
  }, [universe.id, storyId, access.publish])

  useEffect(() => {
    if (!storyId) return
    const controller = new AbortController()

    getStory(universe.id, storyId, controller.signal)
      .then((story) => {
        setState({ kind: 'ready', story })
        setStale(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'missing' })
          return
        }

        // A story already on screen stays there, marked as possibly out of date, rather than being taken away - and
        // with it any prose being written beside it. Only a first read that fails has nothing to show.
        setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }))
        setStale(true)
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, storyId, reloads])

  // Whatever has just moved keeps the focus on its own ⋯ menu, wherever the page put it: the move was made from that
  // menu, and moving the row in the page can take the focus off it.
  useEffect(() => {
    const selector = pendingFocus.current
    if (!selector || state.kind !== 'ready') return
    pendingFocus.current = null
    const target = document.querySelector<HTMLElement>(selector)
    // The folds around it open before this returns, so a hidden row can still take the focus.
    revealInFolds(target)
    target?.focus()
  }, [state])

  // A link to one scene - a search result, or the manuscript's way back to its scene - lands on it, whichever view it
  // opens: scrolled to, given the focus so a keyboard and a screen reader arrive there too, and
  // marked for a moment so the eye can tell which of twenty rows it meant. The location's key runs it again when the
  // same link is followed twice.
  const isReady = state.kind === 'ready'
  useEffect(() => {
    if (!isReady || location.hash.length < 2) return
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (!target) return

    revealInFolds(target)
    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [isReady, view, location.hash, location.key])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setReloads((count) => count + 1)
  }, [])

  function setMessage(text: string | null) {
    setRaised(text === null ? null : { at: location.pathname, text })
  }

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        {t('stories.page.opening')}
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <EmptyState
        testId="story-missing"
        title={t('stories.page.missing.title')}
        hint={tx('stories.page.missing.hint', {
          link: (
            <Link to={`/app/universes/${universe.id}/stories`}>
              {t('stories.page.missing.back')}
            </Link>
          ),
        })}
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="story-load-error">
        <p>{t('stories.page.loadError')}</p>
        <button className="button button--secondary" type="button" onClick={retry}>
          {t('stories.page.retry')}
        </button>
      </div>
    )
  }

  const { story } = state
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
  const storyPath = `/app/universes/${universe.id}/stories/${story.id}`
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

  function showStory(next: StoryDetail) {
    setState((current) => (current.kind === 'ready' ? { ...current, story: next } : current))
  }

  /** Whether anyone can read the story now; null until known, when no part claims to be public. */
  const storyPublication = publication?.storyId === story.id ? publication : null
  const storyIsPublic = storyPublication?.state
    ? storyPublication.state.visibility === Visibility.Public &&
      storyPublication.state.universeIsPublic &&
      storyPublication.state.publicSummary !== null
    : null

  /**
   * The lore of one scene, dragged into a new order on its card. The chips move at once and the scene is saved behind
   * them; a refused save puts the story back as the server has it and says so.
   */
  async function reorderLore(scene: Scene, entityIds: string[]) {
    const byId = new Map(scene.entities.map((reference) => [reference.entityId, reference]))
    const reordered = entityIds.map((id) => byId.get(id)).filter((one) => one !== undefined)
    if (reordered.length !== scene.entities.length) return

    setMessage(null)
    patchScene(scene.id, { entities: reordered })

    try {
      const saved = await updateScene(universe.id, story.id, scene.id, {
        title: scene.title,
        summary: scene.summary,
        notes: scene.notes,
        povEntityId: scene.pov?.entityId ?? null,
        chronology: scene.chronology,
        entityIds,
        chapterId: scene.chapterId,
        expectedVersion: scene.version,
      })
      patchScene(scene.id, saved)
      setAnnouncement(t('stories.page.loreReordered', { title: scene.title }))
    } catch (error: unknown) {
      patchScene(scene.id, { entities: scene.entities })
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
      reload()
    }
  }

  function patchScene(id: string, patch: Partial<Scene>) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              scenes: current.story.scenes.map((scene) =>
                scene.id === id ? { ...scene, ...patch } : scene,
              ),
            },
          }
        : current,
    )
  }

  function patchArc(id: string, visibility: VisibilityValue) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              arcs: current.story.arcs.map((arc) => (arc.id === id ? { ...arc, visibility } : arc)),
            },
          }
        : current,
    )
  }

  function showArcs(next: PlotArc[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              arcs: next,
              scenes: readingOrder(next, current.story.chapters, current.story.scenes),
            },
          }
        : current,
    )
  }

  /** One container's scenes replaced, the rest of the story left as it is. */
  function showContainer(chapterId: string | null, replacement: Scene[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              scenes: readingOrder(current.story.arcs, current.story.chapters, [
                ...current.story.scenes.filter((scene) => scene.chapterId !== chapterId),
                ...replacement,
              ]),
            },
          }
        : current,
    )
  }

  function showChapters(nextChapters: Chapter[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              chapters: nextChapters,
              scenes: readingOrder(current.story.arcs, nextChapters, current.story.scenes),
            },
          }
        : current,
    )
  }

  /** Moves one scene one place inside its container, at once on screen, and puts it back if refused. */
  async function moveWithin(scene: Scene, by: -1 | 1) {
    if (isMoving.current) return

    const container = scenesIn(scenes, scene.chapterId)
    const from = container.findIndex((candidate) => candidate.id === scene.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= container.length) return

    const next = [...container]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = sceneMenu(scene.id)
    showContainer(
      scene.chapterId,
      next.map((candidate, index) => ({ ...candidate, sortOrder: index })),
    )

    try {
      showContainer(
        scene.chapterId,
        await reorderScenes(
          universe.id,
          story.id,
          scene.chapterId,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        hasChapters
          ? t('stories.page.sceneMovedIn', {
              title: scene.title,
              n: to + 1,
              total: next.length,
              container: containerName(scene.chapterId),
            })
          : t('stories.page.sceneMoved', { title: scene.title, n: to + 1, total: next.length }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one scene to the end of another chapter, or of Unchaptered. */
  async function moveTo(scene: Scene, chapterId: string | null) {
    if (isMoving.current) return

    isMoving.current = true
    setMessage(null)

    try {
      const saved = await moveScene(universe.id, story.id, scene.id, chapterId)
      pendingFocus.current = sceneMenu(scene.id)
      showStory(saved)

      const count = scenesIn(saved.scenes, chapterId).length
      setAnnouncement(
        t('stories.page.sceneMovedTo', {
          title: scene.title,
          container: containerName(chapterId),
          n: count,
          total: count,
        }),
      )
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('stories.page.sceneMoveFailed'))
      document.querySelector<HTMLElement>(sceneMenu(scene.id))?.focus()
    } finally {
      isMoving.current = false
    }
  }

  /**
   * Moves one chapter one place inside its arc - or among the chapters in no arc - at once on screen, and puts it back if
   * refused. The story keeps one chapter order, so the move swaps it with its neighbour there.
   */
  async function moveChapter(chapter: Chapter, by: -1 | 1) {
    if (isMoving.current) return

    const arcId =
      chapter.plotArcId !== null && arcIndex(chapter.plotArcId) >= 0 ? chapter.plotArcId : null
    const group = arcId === null ? groups.unarced : groups.arcs[arcIndex(arcId)].chapters
    const inGroup = group.findIndex((candidate) => candidate.id === chapter.id)
    const neighbour = group[inGroup + by]
    if (inGroup < 0 || !neighbour) return

    const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder)
    const from = ordered.findIndex((candidate) => candidate.id === chapter.id)
    const to = ordered.findIndex((candidate) => candidate.id === neighbour.id)
    const next = [...ordered]
    next[from] = neighbour
    next[to] = chapter

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#chapter-${chapter.id} [data-testid="chapter-actions"]`
    showChapters(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      showChapters(
        await reorderChapters(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        t('stories.page.chapterMoved', {
          title: chapter.title,
          n: inGroup + by + 1,
          total: group.length,
        }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves a chapter into another arc, last there, or out of every arc (ADR 0070). Its scenes go with it. */
  async function moveChapterArc(chapter: Chapter, arcId: string | null) {
    if (isMoving.current) return

    isMoving.current = true
    setMessage(null)
    try {
      await moveChapterToArc(universe.id, story.id, chapter.id, arcId)
      pendingFocus.current = `#chapter-${chapter.id} [data-testid="chapter-actions"]`
      const index = arcIndex(arcId)
      setAnnouncement(
        arcId === null || index < 0
          ? t('stories.page.chapterNoArc', { title: chapter.title })
          : t('stories.page.chapterMovedToArc', {
              title: chapter.title,
              label: arcLabel(index, groups.arcs[index].arc.title),
            }),
      )
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('stories.page.chapterMoveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** Moves one arc one place, at once on screen, and puts it back if refused. */
  async function moveArc(arc: PlotArc, by: -1 | 1) {
    if (isMoving.current) return

    const ordered = groups.arcs.map((entry) => entry.arc)
    const from = ordered.findIndex((candidate) => candidate.id === arc.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= ordered.length) return

    const next = [...ordered]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    isMoving.current = true
    setMessage(null)
    pendingFocus.current = `#arc-${arc.id} [data-testid="arc-actions"]`
    showArcs(next.map((candidate, index) => ({ ...candidate, sortOrder: index })))

    try {
      showArcs(
        await reorderPlotArcs(
          universe.id,
          story.id,
          next.map((candidate) => candidate.id),
        ),
      )
      setAnnouncement(
        t('stories.page.arcMoved', { title: arc.title, n: to + 1, total: next.length }),
      )
    } catch (error: unknown) {
      showStory(story)
      setMessage(error instanceof ApiError ? error.message : t('stories.page.orderFailed'))
    } finally {
      isMoving.current = false
    }
  }

  /** The arc alone goes to the Trash. Its chapters stay, in no arc until it is restored. */
  async function removeArc(arc: PlotArc, index: number) {
    const count = groups.arcs[index]?.chapters.length ?? 0
    setMessage(null)
    const removed = await confirmAction({
      title: t('stories.page.removeArc.title', { label: arcLabel(index, arc.title) }),
      message:
        count === 0
          ? t('stories.page.removeArc.empty')
          : t('stories.page.removeArc.message', { chapters: chapterCountLabel(count) }),
      confirmLabel: t('stories.page.removeArc.confirm'),
      busyLabel: t('stories.page.removeArc.busy'),
      variant: 'warning',
      failure: t('stories.page.removeArc.failure'),
      action: () => deletePlotArc(universe.id, story.id, arc.id),
    })
    if (!removed) return
    setAnnouncement(t('stories.page.removeArc.done', { title: arc.title }))
    reload()
  }

  async function removeScene(scene: Scene) {
    setMessage(null)
    const removed = await confirmAction({
      title: tx('stories.page.removeScene.title', { title: <bdi>{scene.title}</bdi> }),
      message:
        scene.beats.length === 0
          ? t('stories.page.removeScene.message')
          : t('stories.page.removeScene.messageWithBeats'),
      confirmLabel: t('stories.page.removeScene.confirm'),
      busyLabel: t('stories.page.removeScene.busy'),
      variant: 'warning',
      failure: t('stories.page.removeScene.failure'),
      action: () => deleteScene(universe.id, story.id, scene.id),
    })
    if (!removed) return
    setAnnouncement(t('stories.page.removeScene.done', { title: scene.title }))
    reload()
  }

  /** Removes the chapter only. Its scenes move, in order, to the end of Unchaptered. */
  async function removeChapter(chapter: Chapter, index: number) {
    const count = scenesIn(scenes, chapter.id).length
    setMessage(null)
    const removed = await confirmAction({
      title: t('stories.page.removeChapter.title', { label: chapterLabel(index, chapter.title) }),
      message:
        count === 0
          ? t('stories.page.removeChapter.messageEmpty')
          : t('stories.page.removeChapter.message', { scenes: sceneCountLabel(count) }),
      confirmLabel: t('stories.page.removeChapter.confirm'),
      busyLabel: t('stories.page.removeChapter.busy'),
      variant: 'warning',
      failure: t('stories.page.removeChapter.failure'),
      action: () => deleteChapter(universe.id, story.id, chapter.id),
    })
    if (!removed) return
    setAnnouncement(
      count === 0
        ? t('stories.page.removeChapter.done', { title: chapter.title })
        : t(
            count === 1
              ? 'stories.page.removeChapter.doneOne'
              : 'stories.page.removeChapter.doneMany',
            { title: chapter.title, scenes: sceneCountLabel(count) },
          ),
    )
    reload()
  }

  async function removeStory() {
    // What goes with the story, one line each, so its size is read before it is moved (Issue #50).
    const details = [
      ...(hasChapters ? [chapterCountLabel(chapters.length)] : []),
      t('stories.page.removeStory.scenes', { scenes: sceneCountLabel(scenes.length) }),
      ...(arcs.length > 0 ? [arcCountLabel(arcs.length)] : []),
    ]
    setMessage(null)
    const removed = await confirmAction({
      title: tx('stories.page.removeStory.title', { title: <bdi>{story.title}</bdi> }),
      message: t('stories.page.removeStory.message'),
      details,
      confirmLabel: t('stories.page.removeStory.confirm'),
      busyLabel: t('stories.page.removeStory.busy'),
      variant: 'warning',
      failure: t('stories.page.removeStory.failure'),
      action: () => deleteStory(universe.id, story.id),
    })
    if (removed) navigate(`/app/universes/${universe.id}/stories`)
  }

  function sceneCards(container: Scene[], titleLevel: 3 | 4 | 5) {
    return container.map((scene, index) => (
      <SceneCard
        key={scene.id}
        universeId={universe.id}
        chronology={chronology}
        scene={scene}
        index={index}
        count={container.length}
        titleLevel={titleLevel}
        moveTargets={targets.filter((target) => target.chapterId !== scene.chapterId)}
        onMove={(target, by) => void moveWithin(target, by)}
        onMoveTo={(target, chapterId) => void moveTo(target, chapterId)}
        onEdit={(target) => setSceneForm({ mode: 'edit', scene: target })}
        onAddBeat={(target) => setSceneForm({ mode: 'edit', scene: target, addBeat: true })}
        onSuggest={(target) => setSceneForm({ mode: 'suggest', scene: target })}
        onDelete={(target) => void removeScene(target)}
        onReorderLore={(target, entityIds) => void reorderLore(target, entityIds)}
        publication={
          access.publish ? (
            <StoryPartPublication
              universeId={universe.id}
              storyId={story.id}
              kind="scene"
              id={scene.id}
              name={scene.title}
              visibility={scene.visibility}
              storyIsPublic={storyIsPublic}
              onChange={(visibility) => patchScene(scene.id, { visibility })}
            />
          ) : null
        }
      />
    ))
  }

  const newScene = (
    <button
      className="button"
      type="button"
      onClick={() => setSceneForm({ mode: 'new', chapterId: null })}
      data-testid="new-scene"
    >
      <ActionIcon icon={Plus} />
      {t('stories.page.newScene')}
    </button>
  )

  const newChapter = (
    <button
      className="button button--secondary"
      type="button"
      onClick={() => setChapterForm({ mode: 'new', arcId: null })}
      data-testid="new-chapter"
    >
      <ActionIcon icon={BookPlus} />
      {t('stories.page.newChapter')}
    </button>
  )

  const newArc = (
    <button
      className="button button--secondary"
      type="button"
      onClick={() => setArcForm({ mode: 'new' })}
      data-testid="new-arc"
    >
      <ActionIcon icon={Layers} />
      {t('stories.page.newArc')}
    </button>
  )

  /** Every place a chapter may move to but the one it is in: each other arc, and no arc. */
  function arcTargets(chapter: Chapter): ArcTarget[] {
    const current =
      chapter.plotArcId !== null && arcIndex(chapter.plotArcId) >= 0 ? chapter.plotArcId : null
    return [
      ...groups.arcs
        .map((entry, index) => ({ id: entry.arc.id, label: arcLabel(index, entry.arc.title) }))
        .filter((target) => target.id !== current),
      ...(current === null ? [] : [{ id: null, label: '' }]),
    ]
  }

  function chapterSections(group: Chapter[], titleLevel: 3 | 4) {
    return group.map((chapter, index) => {
      const inside = scenesIn(scenes, chapter.id)
      return (
        <ChapterSection
          key={chapter.id}
          chapter={chapter}
          index={index}
          count={group.length}
          sceneCount={inside.length}
          titleLevel={titleLevel}
          arcTargets={arcTargets(chapter)}
          onMoveToArc={(target, arcId) => void moveChapterArc(target, arcId)}
          onMove={(target, by) => void moveChapter(target, by)}
          onAddScene={(target) => setSceneForm({ mode: 'new', chapterId: target.id })}
          onEdit={(target, at) => setChapterForm({ mode: 'edit', chapter: target, index: at })}
          onDelete={(target, at) => void removeChapter(target, at)}
          startsOpen={chapter.id === opensOn}
        >
          <ol className="scenes" data-testid="chapter-scenes">
            {sceneCards(inside, titleLevel === 4 ? 5 : 4)}
          </ol>
        </ChapterSection>
      )
    })
  }

  return (
    <article className={`story story--${view}`} data-testid="story-page">
      <PageHeader
        crumb={
          <nav className="story__crumbs" aria-label={t('stories.page.breadcrumb')}>
            <Link to={`/app/universes/${universe.id}/stories`}>{t('stories.page.crumb')}</Link>
          </nav>
        }
        title={<bdi>{story.title}</bdi>}
        titleTestId="story-title"
        lede={
          // Writing needs the height more than the facts: the Manuscript view keeps the title and the views only.
          view === 'manuscript' ? null : (
            // A div, because the publication control's panel is not phrasing content. The story's publication sits
            // with its other facts: the bar under the title is full at 360px, and this line has room.
            <div className="story__meta">
              <StatusBadge
                step={story.status}
                label={STORY_STATUS_LABELS[story.status]}
                testId="story-status"
              />
              {hasChapters ? (
                <span data-testid="story-chapter-count">{chapterCountLabel(chapters.length)}</span>
              ) : null}
              <span>{sceneCountLabel(scenes.length)}</span>
              {storyPublication ? (
                <ContentPublication
                  key={story.id}
                  universeId={universe.id}
                  kind="story"
                  id={story.id}
                  name={story.title}
                  placement="line"
                  initialState={storyPublication.state ?? undefined}
                  onChange={(state) => setPublication({ storyId: story.id, state })}
                />
              ) : null}
              <Link className="story__timeline" to={timelinePath} data-testid="story-timeline">
                {t('stories.page.timeline')}
              </Link>
              {/* Comments on the story as a whole. Not on the Manuscript view, where each scene has its own. */}
              <ReviewComments
                universeId={universe.id}
                subject={{ kind: 'story', storyId: story.id }}
                subjectName={story.title}
                describeSuggestion={storyChanges}
                onSuggestionAccepted={reload}
                onSuggest={() => setStoryForm('suggest')}
              />
            </div>
          )
        }
      >
        <div className="story__bar">
          <nav
            className="views story__views"
            aria-label={t('stories.page.views')}
            data-testid="story-views"
          >
            <NavLink to={storyPath} end className="views__link" data-testid="story-view-scenes">
              {t('stories.page.viewScenes')}
            </NavLink>
            <NavLink
              to={`${storyPath}/manuscript`}
              className="views__link"
              data-testid="story-view-manuscript"
            >
              {t('stories.page.viewManuscript')}
            </NavLink>
            {access.keepIdeas ? (
              <NavLink
                to={`${storyPath}/ideas`}
                className="views__link"
                data-testid="story-view-ideas"
              >
                {t('stories.page.viewIdeas')}
              </NavLink>
            ) : null}
          </nav>

          {/* Every view keeps a way to the story's world chronology here, the Manuscript view included, whose header has
              no line of facts to hold it. */}
          <ActionMenu
            className="story__menu"
            label={t('stories.page.storyActions', { title: story.title })}
            triggerTestId="story-actions"
          >
            <Link className="actionmenu__item" to={timelinePath} data-testid="menu-story-timeline">
              <ActionIcon icon={Hourglass} />
              {t('stories.page.menuTimeline')}
            </Link>
            {access.suggestChanges && !access.editContent ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => setStoryForm('suggest')}
                data-testid="suggest-story"
              >
                <ActionIcon icon={FilePenLine} />
                {t('stories.page.suggest')}
              </button>
            ) : null}
            {access.editContent ? (
              <>
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => setStoryForm('edit')}
                  data-testid="edit-story"
                >
                  <ActionIcon icon={Pencil} />
                  {t('stories.page.editStory')}
                </button>
                <hr className="actionmenu__divider" />
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  onClick={() => void removeStory()}
                  data-testid="delete-story"
                >
                  <ActionIcon icon={Trash} />
                  {t('stories.page.deleteStory')}
                </button>
              </>
            ) : null}
          </ActionMenu>
        </div>
      </PageHeader>

      {sent ? (
        <p className="callout story__sent" role="status" data-testid="suggestion-sent">
          {t('stories.page.sent')}
        </p>
      ) : null}

      {stale ? (
        <div className="notice notice--error story__stale" role="alert" data-testid="story-stale">
          <p>{t('stories.page.stale')}</p>
          <button className="button button--secondary" type="button" onClick={reload}>
            {t('stories.page.staleRetry')}
          </button>
        </div>
      ) : null}

      {view === 'ideas' ? (
        access.keepIdeas ? (
          <IdeasBrowser
            scope={{
              kind: 'story',
              universe: { id: universe.id, name: universe.name },
              story: { id: story.id },
            }}
          />
        ) : (
          <EmptyState
            testId="role-unavailable"
            title={t('stories.page.unavailable.title')}
            hint={t('stories.page.unavailable.hint')}
          />
        )
      ) : view === 'manuscript' ? (
        <ManuscriptPanel
          universeId={universe.id}
          story={story}
          chronology={chronology}
          sceneId={sceneId}
          onEditScene={(scene) => setSceneForm({ mode: 'edit', scene })}
          onSuggestScene={(scene) => setSceneForm({ mode: 'suggest', scene })}
          onSceneChanged={reload}
          onSceneSaved={(saved) => patchScene(saved.id, saved)}
          manuscriptPublication={(scene) =>
            access.publish ? (
              <StoryPartPublication
                universeId={universe.id}
                storyId={story.id}
                kind="manuscript"
                id={scene.id}
                name={scene.title}
                visibility={scene.manuscriptVisibility}
                storyIsPublic={storyIsPublic}
                onChange={(manuscriptVisibility) => patchScene(scene.id, { manuscriptVisibility })}
              />
            ) : null
          }
        />
      ) : (
        <section className="story__scenes" aria-labelledby="story-scenes-heading">
          <h2 className="visually-hidden" id="story-scenes-heading">
            {t('stories.page.scenesHeading')}
          </h2>

          {story.premise ? (
            <p className="story__premise prose" data-testid="story-premise">
              {story.premise}
            </p>
          ) : null}

          {isEmpty ? null : (
            <div className="story__toolbar">
              <p className="chron__aside story__aside">
                {hasStructure ? t('stories.page.asideStructured') : t('stories.page.aside')}
              </p>
              {access.editContent ? (
                <div className="story__toolbaractions">
                  {newArc}
                  {newChapter}
                  <span className="story__create">{newScene}</span>
                </div>
              ) : null}
            </div>
          )}

          {message ? (
            <p className="form__message" role="alert" data-testid="story-error">
              {message}
            </p>
          ) : null}

          {isEmpty ? (
            <EmptyState
              testId="scenes-empty"
              title={t('stories.page.empty.title')}
              hint={t('stories.page.empty.hint')}
              action={
                access.editContent ? (
                  <>
                    {newScene}
                    {newChapter}
                    {newArc}
                  </>
                ) : undefined
              }
            />
          ) : null}

          {!hasStructure && scenes.length > 0 ? (
            <ol className="scenes" data-testid="scene-list">
              {sceneCards(scenes, 3)}
            </ol>
          ) : null}

          {hasStructure && unchaptered.length > 0 ? (
            <section
              className="storygroup"
              aria-labelledby="unchaptered-heading"
              data-testid="unchaptered"
            >
              <header className="storygroup__head">
                <h3 className="storygroup__title" id="unchaptered-heading">
                  {unchapteredLabel()}
                </h3>
                <p className="storygroup__hint">
                  {t('stories.page.unchapteredHint', {
                    scenes: sceneCountLabel(unchaptered.length),
                  })}
                </p>
              </header>
              <ol className="scenes" data-testid="unchaptered-scenes">
                {sceneCards(unchaptered, 4)}
              </ol>
            </section>
          ) : null}

          {chapterSections(groups.unarced, 3)}

          {groups.arcs.map(({ arc, chapters: inArc }, index) => (
            <ArcSection
              key={arc.id}
              arc={arc}
              index={index}
              count={groups.arcs.length}
              chapterCount={inArc.length}
              onMove={(target, by) => void moveArc(target, by)}
              onAddChapter={(target) => setChapterForm({ mode: 'new', arcId: target.id })}
              onEdit={(target, at) => setArcForm({ mode: 'edit', arc: target, index: at })}
              onDelete={(target, at) => void removeArc(target, at)}
              startsOpen={index === 0}
              publication={
                access.publish ? (
                  <StoryPartPublication
                    universeId={universe.id}
                    storyId={story.id}
                    kind="arc"
                    id={arc.id}
                    name={arc.title}
                    visibility={arc.visibility}
                    storyIsPublic={storyIsPublic}
                    onChange={(visibility) => patchArc(arc.id, visibility)}
                  />
                ) : null
              }
            >
              {chapterSections(inArc, 4)}
            </ArcSection>
          ))}
        </section>
      )}

      <p className="visually-hidden" role="status" aria-live="polite" data-testid="story-announcer">
        {announcement}
      </p>

      {sceneForm.mode !== 'closed' ? (
        <SceneForm
          universeId={universe.id}
          storyId={story.id}
          scene={sceneForm.mode === 'new' ? null : sceneForm.scene}
          chapters={chapters}
          arcs={arcs}
          chapterId={sceneForm.mode === 'new' ? sceneForm.chapterId : sceneForm.scene.chapterId}
          chronology={chronology}
          startWithBeat={sceneForm.mode === 'edit' && sceneForm.addBeat === true}
          onClose={() => setSceneForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setSceneForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedScene', { title: saved.title }))
            reload()
          }}
          onSuggested={
            sceneForm.mode === 'suggest'
              ? () => {
                  setSceneForm({ mode: 'closed' })
                  setSent(true)
                }
              : undefined
          }
        />
      ) : null}

      {chapterForm.mode !== 'closed' ? (
        <ChapterForm
          universeId={universe.id}
          storyId={story.id}
          chapter={chapterForm.mode === 'edit' ? chapterForm.chapter : null}
          number={chapterForm.mode === 'edit' ? chapterNumber(chapterForm.index) : null}
          plotArcId={chapterForm.mode === 'new' ? chapterForm.arcId : null}
          arcs={groups.arcs.map((entry) => entry.arc)}
          onClose={() => setChapterForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setChapterForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedChapter', { title: saved.title }))
            reload()
          }}
        />
      ) : null}

      {arcForm.mode !== 'closed' ? (
        <PlotArcForm
          universeId={universe.id}
          storyId={story.id}
          arc={arcForm.mode === 'edit' ? arcForm.arc : null}
          number={arcForm.mode === 'edit' ? arcNumber(arcForm.index) : null}
          onClose={() => setArcForm({ mode: 'closed' })}
          onSaved={(saved) => {
            setArcForm({ mode: 'closed' })
            setAnnouncement(t('stories.page.savedArc', { title: saved.title }))
            reload()
          }}
        />
      ) : null}

      {storyForm !== 'closed' ? (
        <StoryForm
          universeId={universe.id}
          story={story}
          onClose={() => setStoryForm('closed')}
          onSuggested={
            storyForm === 'suggest'
              ? () => {
                  setStoryForm('closed')
                  setSent(true)
                }
              : undefined
          }
          onSaved={(saved) => {
            setStoryForm('closed')
            showStory(saved)
          }}
        />
      ) : null}
    </article>
  )
}
