import type { ReactNode, RefObject } from 'react'
import { useI18n } from '../i18n'
import { ActionBar } from './ActionBar'
import { Button } from './Button'

/**
 * The bar while selecting (Lore, Trash): how many are selected, the screen's own action, then Select page, Clear and
 * Done. The caller passes its words, test ids and focus refs. Catalogue: docs/design/ui-components.md.
 */
export function SelectionBar({
  className,
  status,
  action,
  selectedCount,
  pageCount,
  selectPage,
  clearSelection,
  onDone,
  selectPageRef,
  labels,
  testIds,
}: {
  className: string
  status: ReactNode
  /** The screen's own action on the selection, first in the row. */
  action: ReactNode
  selectedCount: number
  pageCount: number
  selectPage: () => void
  clearSelection: () => void
  onDone: () => void
  selectPageRef?: RefObject<HTMLButtonElement | null>
  labels: { selectPage: string; clear: string }
  testIds: { bar: string; count: string; selectPage: string; clear: string; done: string }
}) {
  const { t } = useI18n()
  return (
    <ActionBar
      className={className}
      testId={testIds.bar}
      statusTestId={testIds.count}
      status={status}
    >
      {action}
      <Button
        tone="secondary"
        ref={selectPageRef}
        onClick={selectPage}
        disabled={pageCount === 0 || selectedCount === pageCount}
        data-testid={testIds.selectPage}
      >
        {labels.selectPage}
      </Button>
      <Button
        tone="text"
        onClick={clearSelection}
        disabled={selectedCount === 0}
        data-testid={testIds.clear}
      >
        {labels.clear}
      </Button>
      <Button tone="secondary" onClick={onDone} data-testid={testIds.done}>
        {t('shell.actions.done')}
      </Button>
    </ActionBar>
  )
}
