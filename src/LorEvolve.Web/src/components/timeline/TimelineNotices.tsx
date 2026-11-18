import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import type { CanonStatusValue } from '../../lore/types'
import type { StorySummary } from '../../stories/types'
import { TimelineSource } from '../../timeline/types'
import type { Dispatch, SetStateAction } from 'react'
import type { LoadState } from '../../timeline/useTimelineState'
import type { SOURCES } from '../../timeline/timelineSources'

/** Above the spine: the story scope with its clear button, the status, era and error lines, and the reading state. */
export function TimelineNotices({
  storyId,
  story,
  stories,
  storyPath,
  update,
  sourceParam,
  canonStatus,
  mixedEras,
  message,
  state,
  setState,
  reload,
}: {
  storyId: string | null
  story: StorySummary | null
  stories: StorySummary[] | null
  storyPath: (id: string) => string
  update: (change: Record<string, string | null>) => void
  sourceParam: (typeof SOURCES)[number] | null
  canonStatus: CanonStatusValue | null
  mixedEras: boolean
  message: string | null
  state: LoadState
  setState: Dispatch<SetStateAction<LoadState>>
  reload: () => void
}) {
  const { tx } = useI18n()
  return (
    <>
      {storyId ? (
        <p className="chron__scope" data-testid="chron-story-scope">
          {story
            ? tx('time.timeline.showing', {
                story: (
                  <Link to={storyPath(story.id)}>
                    <bdi>{story.title}</bdi>
                  </Link>
                ),
              })
            : stories
              ? t('time.timeline.storyNotAvailable')
              : null}{' '}
          <button
            className="button button--text"
            type="button"
            onClick={() => update({ story: null })}
            data-testid="chron-story-clear"
          >
            {t('time.timeline.showEvery')}
          </button>
        </p>
      ) : null}

      {canonStatus !== null &&
      (sourceParam === null || sourceParam.source === TimelineSource.Scene) ? (
        <p className="chron__aside" data-testid="chron-status-scenes">
          {t('time.timeline.scenesNoStatus')}
        </p>
      ) : null}

      {mixedEras ? (
        <p className="chron__caution" data-testid="chron-eras">
          {t('time.timeline.mixedLabels')}
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="chron-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('time.timeline.reading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              reload()
            }}
          >
            {t('time.timeline.tryAgain')}
          </button>
        </div>
      ) : null}
    </>
  )
}
