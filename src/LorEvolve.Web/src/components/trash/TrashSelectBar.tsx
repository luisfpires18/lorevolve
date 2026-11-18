import { t } from '../../i18n'
import type { TrashItem } from '../../trash/types'
import type { useTrashState } from '../../trash/useTrashState'
import { Button } from '../Button'

/** The bar while selecting: how many are selected, Delete permanently, Select page, Clear and Done. */
export function TrashSelectBar({
  selected,
  pageItems,
  bulkDeleteRef,
  selectPageRef,
  selectToggleRef,
  askToBulkErase,
  selectPage,
  clearSelection,
  stopSelecting,
}: Pick<ReturnType<typeof useTrashState>, 'bulkDeleteRef' | 'selectPageRef' | 'selectToggleRef'> & {
  selected: TrashItem[]
  pageItems: TrashItem[]
  askToBulkErase: () => void
  selectPage: () => void
  clearSelection: () => void
  stopSelecting: () => void
}) {
  return (
    <footer className="actionbar trash__selectbar" data-testid="trash-selectbar">
      <p className="actionbar__status" role="status" data-testid="trash-selected-count">
        {selected.length === 0
          ? t('data.trash.bar.hint')
          : t('data.trash.bar.selected', { n: selected.length })}
      </p>
      <div className="actionbar__actions">
        {/* The one red control on the screen while selecting; the selection's own tools stay neutral. */}
        <Button
          tone="danger-quiet"
          ref={bulkDeleteRef}
          onClick={askToBulkErase}
          disabled={selected.length === 0}
          data-testid="trash-bulk-delete"
        >
          {selected.length > 0
            ? t('data.trash.bar.delete', { n: selected.length })
            : t('data.trash.bar.deleteNone')}
        </Button>
        <Button
          tone="secondary"
          ref={selectPageRef}
          onClick={selectPage}
          disabled={pageItems.length === 0 || selected.length === pageItems.length}
          data-testid="trash-select-page"
        >
          {t('data.trash.bar.selectPage')}
        </Button>
        <Button
          tone="text"
          onClick={clearSelection}
          disabled={selected.length === 0}
          data-testid="trash-clear-selection"
        >
          {t('data.trash.bar.clear')}
        </Button>
        <Button
          tone="secondary"
          onClick={() => {
            stopSelecting()
            requestAnimationFrame(() => selectToggleRef.current?.focus())
          }}
          data-testid="trash-select-done"
        >
          {t('data.trash.bar.done')}
        </Button>
      </div>
    </footer>
  )
}
