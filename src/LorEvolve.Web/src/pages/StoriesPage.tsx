import { useCallback, useRef, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useI18n } from '../i18n'
import { CoverDrawer } from '../components/CoverDrawer'
import { pictureUrl, projectCoverStore, storyCoverStore } from '../covers/api'
import { ApiError } from '../lib/api'
import { StoryForm } from '../components/StoryForm'
import { listAllProjects } from '../projects/api'
import { lifecycleLabel, projectRowPath, storyProjectPath } from '../projects/sections'
import { focusCardMenu, withCover } from '../projects/shelfActions'
import { ProjectKind, type ProjectDetail } from '../projects/types'
import { WRITING_PROJECTS, sectionLabel } from '../universes/sections'
import { listStories, reorderStories } from '../stories/api'
import { sceneCountLabel } from '../stories/format'
import { STORY_STATUS_LABELS, type StorySummary } from '../stories/types'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { CardGrid } from '../components/CardGrid'
import { ShelfCard, shelfStep } from '../components/ShelfCard'
import { NewButton } from '../components/NewButton'
import { Announce } from '../components/Announce'
import { ReadGate } from '../components/ReadGate'
import { useAsyncRead } from '../lib/useAsyncRead'
import { FormMessage } from '../components/FormMessage'

/**
 * The stories told in this universe. A story is narrative an author writes with the lore - it draws
 * on the lore and never changes it - so this list sits beside Lore and Timeline rather than inside
 * either.
 *
 * A list that cannot be read says so in the same words and with the same Try again as a story, a
 * manuscript and the workspace itself, rather than passing on whatever the request failed with.
 *
 * The stories are in the author's order, not by title: each row's ⋯ menu moves it one place up or down, at once on
 * screen, and puts it back if the move is refused. A new story goes last.
 */
export default function StoriesPage() {
  const { t } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const navigate = useNavigate()
  const heading = sectionLabel(WRITING_PROJECTS)
  const read = useCallback(
    (signal: AbortSignal) => {
      // The Writing projects that are not stories are additive: a refused read leaves the stories as they are.
      const others = listAllProjects({ universeId: universe.id }, signal)
        .then((projects) =>
          projects.filter((project) => project.kind === ProjectKind.Writing && !project.storyId),
        )
        .catch((): ProjectDetail[] => [])
      return Promise.all([listStories(universe.id, signal), others]).then(([stories, rest]) => ({
        stories,
        others: rest,
      }))
    },
    [universe.id],
  )
  const { load: state, setLoad: setState, retry } = useAsyncRead(read)
  const [isCreating, setIsCreating] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const isMoving = useRef(false)
  const [covering, setCovering] = useState<StorySummary | null>(null)

  /** Moves one story one place, on screen first; the API's answer is the order kept, and a refusal puts it back. */
  async function move(story: StorySummary, by: -1 | 1) {
    if (state.kind !== 'ready' || isMoving.current) return
    const before = state.value.stories
    const from = before.findIndex((candidate) => candidate.id === story.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= before.length) return

    const after = [...before]
    after.splice(to, 0, ...after.splice(from, 1))
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', value: { stories: after, others: state.value.others } })
    focusCardMenu('data-story-id', story.id, 'story')
    try {
      const saved = await reorderStories(
        universe.id,
        after.map((candidate) => candidate.id),
      )
      setState({ kind: 'ready', value: { stories: saved, others: state.value.others } })
      setAnnouncement(
        t('stories.browse.moved', { title: story.title, n: to + 1, total: after.length }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', value: { stories: before, others: state.value.others } })
      setMoveError(error instanceof ApiError ? error.message : t('stories.browse.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  return (
    <article className="stories">
      <PageHeader
        title={heading}
        lede={t('stories.browse.lede')}
        actions={
          access.editContent ? (
            <NewButton onClick={() => setIsCreating(true)} data-testid="new-story">
              {t('stories.browse.newStory')}
            </NewButton>
          ) : undefined
        }
      />

      {/* The shelves sit below the notices, so the gate draws only the loading and failed lines here. */}
      <ReadGate
        load={state}
        loading={{ text: t('stories.browse.reading') }}
        error={{
          message: t('stories.browse.loadError'),
          onRetry: retry,
          retryLabel: t('stories.browse.retry'),
          testId: 'stories-load-error',
        }}
      >
        {() => null}
      </ReadGate>

      <Announce testId="stories-announcement">{announcement}</Announce>
      {moveError ? <FormMessage testId="stories-move-error">{moveError}</FormMessage> : null}

      {state.kind === 'ready' && state.value.stories.length > 0 ? (
        // Each story as a book on its shelf (owner, 2026-11-17); the Gaming page draws its games the same way.
        <CardGrid min={15} gap={5} testId="story-list">
          {state.value.stories.map((story, index, stories) => (
            <ShelfCard
              key={story.id}
              frame="book"
              href={storyProjectPath(universe.id, story.id)}
              title={story.title}
              description={story.premise}
              step={story.status}
              statusLabel={STORY_STATUS_LABELS[story.status]}
              meta={
                <span data-testid="story-scene-count">{sceneCountLabel(story.sceneCount)}</span>
              }
              cover={
                story.cover
                  ? pictureUrl(storyCoverStore(universe.id, story.id), story.cover, 'card')
                  : null
              }
              attrs={{
                'data-testid': 'story-row',
                'data-title': story.title,
                'data-story-id': story.id,
              }}
              testPrefix="story"
              menuLabel={
                access.editContent
                  ? t('stories.browse.moreActions', { title: story.title })
                  : undefined
              }
              onCover={access.editContent ? () => setCovering(story) : undefined}
              move={{
                first: index === 0,
                last: index === stories.length - 1,
                onMove: (step) => void move(story, step),
              }}
            />
          ))}
        </CardGrid>
      ) : null}

      {covering ? (
        <CoverDrawer
          universeId={universe.id}
          name={covering.title}
          cover={covering.cover ?? null}
          store={storyCoverStore(universe.id, covering.id)}
          onChanged={(cover) => {
            setCovering({ ...covering, cover })
            setState((current) =>
              current.kind === 'ready'
                ? {
                    kind: 'ready',
                    value: {
                      ...current.value,
                      stories: withCover(current.value.stories, covering.id, cover),
                    },
                  }
                : current,
            )
          }}
          onClose={() => setCovering(null)}
        />
      ) : null}

      {state.kind === 'ready' && state.value.others.length > 0 ? (
        <CardGrid min={15} gap={5} testId="writing-project-list">
          {state.value.others.map((project) => (
            <ShelfCard
              key={project.id}
              frame="book"
              href={projectRowPath(project)}
              title={project.name}
              description={project.summary}
              step={shelfStep(project.lifecycle)}
              statusLabel={lifecycleLabel(project.lifecycle)}
              cover={
                project.cover
                  ? pictureUrl(projectCoverStore(project.id), project.cover, 'card')
                  : null
              }
              attrs={{ 'data-testid': 'writing-project-row' }}
            />
          ))}
        </CardGrid>
      ) : null}

      {state.kind === 'ready' &&
      state.value.stories.length === 0 &&
      state.value.others.length === 0 ? (
        <EmptyState
          testId="stories-empty"
          title={t('stories.browse.empty.title')}
          hint={t('stories.browse.empty.hint')}
          action={
            access.editContent ? (
              <NewButton onClick={() => setIsCreating(true)} data-testid="empty-new-story">
                {t('stories.browse.empty.newStory')}
              </NewButton>
            ) : undefined
          }
        />
      ) : null}

      {isCreating ? (
        <StoryForm
          universeId={universe.id}
          story={null}
          onClose={() => setIsCreating(false)}
          onSaved={(story) => navigate(storyProjectPath(universe.id, story.id))}
        />
      ) : null}
    </article>
  )
}
