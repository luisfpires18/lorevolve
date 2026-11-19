import { useI18n } from '../i18n'
import { Button } from './Button'

/**
 * Show more under a list that grows: the count line, a line when the last read failed, and the button. Draws nothing
 * when there is no more. A list that knows its page count uses `Pager` instead.
 * `announce={false}` hides the count from screen readers, for a screen that announces it already.
 */
export function ShowMore({
  hasMore,
  status,
  onMore,
  shown,
  total,
  announce = true,
  disabled,
  testId,
}: {
  hasMore: boolean
  status: 'idle' | 'loading' | 'error'
  onMore: () => void
  /** With `total`: draws "Showing X of Y". */
  shown?: number
  total?: number
  announce?: boolean
  /** While something else on the screen is reading. */
  disabled?: boolean
  testId?: string
}) {
  const { t } = useI18n()
  if (!hasMore) return null

  return (
    <div className="showmore">
      {shown !== undefined && total !== undefined ? (
        <p
          className="showmore__shown"
          role={announce ? 'status' : undefined}
          aria-hidden={announce ? undefined : true}
        >
          {t('shell.showMore.shown', { shown, total })}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="showmore__error" role="alert">
          {t('shell.showMore.error')}
        </p>
      ) : null}
      <Button
        tone="secondary"
        busy={status === 'loading'}
        busyLabel={t('shell.showMore.loading')}
        disabled={disabled}
        onClick={onMore}
        data-testid={testId}
      >
        {status === 'error' ? t('shell.app.tryAgain') : t('shell.showMore.label')}
      </Button>
    </div>
  )
}
