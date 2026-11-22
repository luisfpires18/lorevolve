import { useI18n } from '../i18n'
import { Button } from './Button'

/**
 * Show more under a list that grows: the count line, a line when the last read failed, and the button. Draws nothing
 * when there is no more. A list that knows its page count uses `Pager` instead.
 * `announce={false}` hides the count from screen readers, for a screen that announces it already.
 * `align="start"` puts the button at the start, as a workspace list does; the portal's lists centre it.
 */
export function ShowMore({
  hasMore,
  status,
  onMore,
  shown,
  total,
  countLabel,
  align = 'center',
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
  /** The count in the list's own words, such as "Showing 2 of 4 worlds"; with `shown` and `total`. */
  countLabel?: string
  align?: 'center' | 'start'
  announce?: boolean
  /** While something else on the screen is reading. */
  disabled?: boolean
  testId?: string
}) {
  const { t } = useI18n()
  if (!hasMore) return null

  return (
    <div className={`showmore showmore--${align}`}>
      {shown !== undefined && total !== undefined ? (
        <p
          className="showmore__shown"
          role={announce ? 'status' : undefined}
          aria-hidden={announce ? undefined : true}
        >
          {countLabel ?? t('shell.showMore.shown', { shown, total })}
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
