import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { ActionIcon } from './ActionIcon'
import { Button } from './Button'

/**
 * Previous, the position, Next: the pages of a list whose API says how many there are. Draws nothing for one page,
 * so a caller does not guard it. A list with no count continues with `ShowMore` instead.
 * `testId` is on the nav; the buttons are `${testId}-previous` and `${testId}-next`.
 */
export function Pager({
  page,
  totalPages,
  onPage,
  disabled,
  testId,
}: {
  page: number
  totalPages: number
  onPage: (next: number) => void
  /** While the list is busy: both buttons wait. */
  disabled?: boolean
  testId?: string
}) {
  const { t } = useI18n()
  if (totalPages <= 1) return null

  return (
    <nav className="pager" aria-label={t('shell.pager.label')} data-testid={testId}>
      <Button
        tone="secondary"
        icon={ArrowLeft}
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        data-testid={testId ? `${testId}-previous` : undefined}
      >
        {t('shell.pager.previous')}
      </Button>
      <span className="pager__position">
        {t('shell.pager.position', { page, total: totalPages })}
      </span>
      <Button
        tone="secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
        data-testid={testId ? `${testId}-next` : undefined}
      >
        {t('shell.pager.next')}
        <ActionIcon icon={ArrowRight} />
      </Button>
    </nav>
  )
}
