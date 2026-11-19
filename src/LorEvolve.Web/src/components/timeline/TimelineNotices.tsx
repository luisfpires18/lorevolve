import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import type { CanonStatusValue } from '../../lore/types'
import type { StorySummary } from '../../stories/types'
import { TimelineSource, type TimelineItemPage } from '../../timeline/types'
import type { Dispatch, SetStateAction } from 'react'
import type { Load } from '../../lib/useAsyncRead'
import type { SOURCES } from '../../timeline/timelineSources'
import { Button } from '../Button'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'
import { QuietNote } from '../QuietNote'

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
  state: Load<TimelineItemPage>
  setState: Dispatch<SetStateAction<Load<TimelineItemPage>>>
  reload: () => void
}) {
  const { tx } = useI18n()
  return (
    <>
      {storyId ? (
        <QuietNote className="chron__scope" testId="chron-story-scope">
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
          <Button
            tone="text"
            onClick={() => update({ story: null })}
            data-testid="chron-story-clear"
          >
            {t('time.timeline.showEvery')}
          </Button>
        </QuietNote>
      ) : null}

      {canonStatus !== null &&
      (sourceParam === null || sourceParam.source === TimelineSource.Scene) ? (
        <QuietNote className="chron__aside" testId="chron-status-scenes">
          {t('time.timeline.scenesNoStatus')}
        </QuietNote>
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

      {state.kind === 'loading' ? <LoadingNote>{t('time.timeline.reading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError
          message={state.message}
          onRetry={() => {
            setState({ kind: 'loading' })
            reload()
          }}
          retryLabel={t('time.timeline.tryAgain')}
        />
      ) : null}
    </>
  )
}
