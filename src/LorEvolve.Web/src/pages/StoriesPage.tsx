import { useEffect, useRef, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useI18n } from '../i18n'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { ApiError } from '../lib/api'
import { StoryForm } from '../components/StoryForm'
import { listStories, reorderStories } from '../stories/api'
import { sceneCountLabel } from '../stories/format'
import { STORY_STATUS_LABELS, type StorySummary } from '../stories/types'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; stories: StorySummary[] } | { kind: 'error' }

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
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const isMoving = useRef(false)

  /** Moves one story one place, on screen first; the API's answer is the order kept, and a refusal puts it back. */
  async function move(story: StorySummary, by: -1 | 1) {
    if (state.kind !== 'ready' || isMoving.current) return
    const before = state.stories
    const from = before.findIndex((candidate) => candidate.id === story.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= before.length) return

    const after = [...before]
    after.splice(to, 0, ...after.splice(from, 1))
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', stories: after })
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-story-id="${story.id}"] [data-testid="story-actions"]`)
        ?.focus(),
    )
    try {
      const saved = await reorderStories(
        universe.id,
        after.map((candidate) => candidate.id),
      )
      setState({ kind: 'ready', stories: saved })
      setAnnouncement(
        t('stories.browse.moved', { title: story.title, n: to + 1, total: after.length }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', stories: before })
      setMoveError(error instanceof ApiError ? error.message : t('stories.browse.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    listStories(universe.id, controller.signal)
      .then((stories) => setState({ kind: 'ready', stories }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, reads])

  return (
    <article className="stories">
      <PageHeader
        title={t('stories.browse.title')}
        lede={t('stories.browse.lede')}
        actions={
          access.editContent ? (
            <button
              className="button"
              type="button"
              onClick={() => setIsCreating(true)}
              data-testid="new-story"
            >
              <ActionIcon icon={Plus} />
              {t('stories.browse.newStory')}
            </button>
          ) : undefined
        }
      />

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('stories.browse.reading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="stories-load-error">
          <p>{t('stories.browse.loadError')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((count) => count + 1)
            }}
          >
            {t('stories.browse.retry')}
          </button>
        </div>
      ) : null}

      <p className="visually-hidden" role="status" data-testid="stories-announcement">
        {announcement}
      </p>
      {moveError ? (
        <p className="form__message" role="alert" data-testid="stories-move-error">
          {moveError}
        </p>
      ) : null}

      {state.kind === 'ready' && state.stories.length > 0 ? (
        <ul className="storylist" data-testid="story-list">
          {state.stories.map((story, index) => (
            <li
              className="storyrow"
              key={story.id}
              data-testid="story-row"
              data-title={story.title}
              data-story-id={story.id}
            >
              <Link className="storyrow__title" to={story.id}>
                <bdi>{story.title}</bdi>
              </Link>
              <p className="storyrow__meta">
                <StatusBadge step={story.status} label={STORY_STATUS_LABELS[story.status]} />
                <span data-testid="story-scene-count">{sceneCountLabel(story.sceneCount)}</span>
                {access.editContent && state.stories.length > 1 ? (
                  <ActionMenu
                    className="storyrow__menu"
                    label={t('stories.browse.moreActions', { title: story.title })}
                    triggerTestId="story-actions"
                  >
                    {index > 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(story, -1)}
                        data-testid="story-move-up"
                      >
                        <ActionIcon icon={ArrowUp} />
                        {t('stories.browse.moveUp')}
                      </button>
                    ) : null}
                    {index < state.stories.length - 1 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(story, 1)}
                        data-testid="story-move-down"
                      >
                        <ActionIcon icon={ArrowDown} />
                        {t('stories.browse.moveDown')}
                      </button>
                    ) : null}
                  </ActionMenu>
                ) : null}
              </p>
              {story.premise ? <p className="storyrow__premise prose">{story.premise}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {state.kind === 'ready' && state.stories.length === 0 ? (
        <EmptyState
          testId="stories-empty"
          title={t('stories.browse.empty.title')}
          hint={t('stories.browse.empty.hint')}
          action={
            access.editContent ? (
              <button
                className="button"
                type="button"
                onClick={() => setIsCreating(true)}
                data-testid="empty-new-story"
              >
                <ActionIcon icon={Plus} />
                {t('stories.browse.empty.newStory')}
              </button>
            ) : undefined
          }
        />
      ) : null}

      {isCreating ? (
        <StoryForm
          universeId={universe.id}
          story={null}
          onClose={() => setIsCreating(false)}
          onSaved={(story) => navigate(`/app/universes/${universe.id}/stories/${story.id}`)}
        />
      ) : null}
    </article>
  )
}
