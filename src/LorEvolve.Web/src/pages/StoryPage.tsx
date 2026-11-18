import { useCallback } from 'react'
import { useUniverseAccess } from '../universes/access'
import {
  BookPlus,
  FilePenLine,
  FileText,
  Hourglass,
  Layers,
  ListTree,
  Pencil,
  Plus,
  Trash,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { ViewChips } from '../components/ViewChips'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { ArcSection } from '../components/ArcSection'
import { ContentPublication } from '../components/ContentPublication'
import { ChapterForm } from '../components/ChapterForm'
import { ChapterSection, type ArcTarget } from '../components/ChapterSection'
import { EmptyState } from '../components/EmptyState'
import { ManuscriptPanel } from '../components/ManuscriptPanel'
import { PageHeader } from '../components/PageHeader'
import { ReviewComments } from '../components/ReviewComments'
import { PlotArcForm } from '../components/PlotArcForm'
import { SceneCard, type MoveTarget } from '../components/SceneCard'
import { SceneForm } from '../components/SceneForm'
import { StoryForm } from '../components/StoryForm'
import { StoryPartPublication } from '../components/StoryPartPublication'
import { Visibility } from '../publishing/types'
import {
  arcLabel,
  arcNumber,
  chapterCountLabel,
  chapterNumber,
  sceneCountLabel,
  unchaptered as unchapteredLabel,
} from '../stories/format'
import { storyChanges } from '../stories/changes'
import { chapterChoices, chapterGroups, chapterNumbers, scenesIn } from '../stories/structure'
import { STORY_STATUS_LABELS, type Chapter, type Scene } from '../stories/types'
import { StatusBadge } from '../components/StatusBadge'
import type { WorkspaceContext } from './UniverseWorkspace'
import { projectPath } from '../projects/sections'
import { useStoryState, type StoryViewName } from '../stories/useStoryState'
import { useStoryLoad } from '../stories/useStoryLoad'
import { useStoryArrival } from '../stories/useStoryArrival'
import { storyPatches } from '../stories/storyPatches'
import { storySceneMoves } from '../stories/storySceneMoves'
import { storyChapterMoves } from '../stories/storyChapterMoves'
import { storyRemovals } from '../stories/storyRemovals'

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
  const {
    state,
    setState,
    stale,
    sceneForm,
    setSceneForm,
    chapterForm,
    setChapterForm,
    arcForm,
    setArcForm,
    storyForm,
    setStoryForm,
    sent,
    setSent,
    announcement,
    setAnnouncement,
    setReloads,
    raised,
    setRaised,
    publication,
    setPublication,
  } = base
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
            <Link to={`/app/universes/${universe.id}/writing`}>
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

  const { showStory, patchScene, patchArc, showArcs, showContainer, showChapters } = storyPatches({
    setState,
  })

  /** Whether anyone can read the story now; null until known, when no part claims to be public. */
  const storyPublication = publication?.storyId === story.id ? publication : null
  const storyIsPublic = storyPublication?.state
    ? storyPublication.state.visibility === Visibility.Public &&
      storyPublication.state.universeIsPublic &&
      storyPublication.state.publicSummary !== null
    : null

  const { reorderLore, moveWithin, moveTo } = storySceneMoves({
    ...base,
    t,
    universe,
    reload,
    setMessage,
    story,
    scenes,
    hasChapters,
    containerName,
    patchScene,
    showStory,
    showContainer,
  })

  const { moveChapter, moveChapterArc, moveArc } = storyChapterMoves({
    ...base,
    t,
    universe,
    reload,
    setMessage,
    story,
    chapters,
    groups,
    arcIndex,
    showStory,
    showArcs,
    showChapters,
  })

  const { removeArc, removeScene, removeChapter, removeStory } = storyRemovals({
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
            <Link to={`/app/universes/${universe.id}/writing`}>{t('stories.page.crumb')}</Link>
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
          <ViewChips
            label={t('stories.page.views')}
            testId="story-views"
            items={[
              {
                to: `${storyPath}/structure`,
                end: true,
                label: t('stories.page.viewStructure'),
                icon: ListTree,
                testId: 'story-view-scenes',
              },
              {
                to: `${storyPath}/manuscript`,
                label: t('stories.page.viewManuscript'),
                icon: FileText,
                testId: 'story-view-manuscript',
              },
            ]}
          />

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

      {view === 'manuscript' ? (
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
            {t('stories.page.structureHeading')}
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
