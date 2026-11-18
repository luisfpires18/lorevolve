import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { EmptyState } from '../EmptyState'
import type { useStoryState } from '../../stories/useStoryState'
import { Button } from '../Button'

/** What the page shows while its story is read, missing, or could not be read. */
export function StoryUnavailable({
  state,
  universe,
  retry,
}: {
  state: ReturnType<typeof useStoryState>['state']
  universe: { id: string }
  retry: () => void
}) {
  const { t, tx } = useI18n()

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
        <Button tone="secondary" onClick={retry}>
          {t('stories.page.retry')}
        </Button>
      </div>
    )
  }

  return null
}
