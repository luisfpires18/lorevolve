import { t } from '../../i18n'
import type { TrashItem } from '../../trash/types'
import type { useTrashState } from '../../trash/useTrashState'
import { Button } from '../Button'
import { SelectionBar } from '../SelectionBar'

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
    <SelectionBar
      className="trash__selectbar"
      status={
        selected.length === 0
          ? t('data.trash.bar.hint')
          : t('data.trash.bar.selected', { n: selected.length })
      }
      action={
        // The one red control on the screen while selecting; the selection's own tools stay neutral.
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
      }
      selectedCount={selected.length}
      pageCount={pageItems.length}
      selectPage={selectPage}
      selectPageRef={selectPageRef}
      clearSelection={clearSelection}
      onDone={() => {
        stopSelecting()
        requestAnimationFrame(() => selectToggleRef.current?.focus())
      }}
      labels={{ selectPage: t('data.trash.bar.selectPage'), clear: t('data.trash.bar.clear') }}
      testIds={{
        bar: 'trash-selectbar',
        count: 'trash-selected-count',
        selectPage: 'trash-select-page',
        clear: 'trash-clear-selection',
        done: 'trash-select-done',
      }}
    />
  )
}
