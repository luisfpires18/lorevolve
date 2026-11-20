import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { Callout } from './Callout'

/**
 * A read that failed, with its retry. Use for every failed read; never for an action error (a save that failed keeps
 * its own message) and never for a missing thing (that is an `EmptyState`). `onRetry` is left out only where no
 * re-read exists. `action` adds a way out beside the retry (a link back to the list).
 */
export function LoadError({
  message,
  onRetry,
  retryLabel,
  retryTestId,
  testId,
  className,
  action,
}: {
  message: ReactNode
  onRetry?: () => void
  retryLabel?: ReactNode
  retryTestId?: string
  testId?: string
  className?: string
  action?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Callout look="notice" tone="error" className={className} role="alert" testId={testId}>
      <p>{message}</p>
      {onRetry && (
        <Button tone="secondary" onClick={onRetry} data-testid={retryTestId}>
          {retryLabel ?? t('shell.app.tryAgain')}
        </Button>
      )}
      {action}
    </Callout>
  )
}
