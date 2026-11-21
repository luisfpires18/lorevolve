import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import type { CanonStatusValue } from '../../lore/types'
import type { StorySummary } from '../../stories/types'
import { TimelineSource, type TimelineItemPage } from '../../timeline/types'
import type { Load } from '../../lib/useAsyncRead'
import type { SOURCES } from '../../timeline/timelineSources'
import { Button } from '../Button'
import { ReadGate } from '../ReadGate'
import { QuietNote } from '../QuietNote'
import { FormMessage } from '../FormMessage'

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
  retry,
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
  retry: () => void
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

      {message ? <FormMessage testId="chron-error">{message}</FormMessage> : null}

      {/* The list itself is drawn below the notices, by the page. */}
      <ReadGate
        load={state}
        loading={{ text: t('time.timeline.reading') }}
        error={{ onRetry: retry, retryLabel: t('time.timeline.tryAgain') }}
      >
        {() => null}
      </ReadGate>
    </>
  )
}
