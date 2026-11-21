import { Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import { Button } from '../Button'
import { SelectionBar } from '../SelectionBar'

type Selection = ReturnType<typeof useLoreSelection>

/** The bar while selecting: how many are selected, Move to Trash, Select page, Clear and Done. */
export function LoreSelectBar({
  isSelecting,
  isTrashing,
  pageItems,
  selected,
  selectPage,
  clearSelection,
  stopSelecting,
  trashSelected,
}: Pick<
  Selection,
  | 'isSelecting'
  | 'isTrashing'
  | 'pageItems'
  | 'selected'
  | 'selectPage'
  | 'clearSelection'
  | 'stopSelecting'
  | 'trashSelected'
>) {
  const { t } = useI18n()
  if (!isSelecting) return null
  return (
    <SelectionBar
      className="lore__selectbar"
      status={
        selected.length === 0
          ? t('lore.page.selectHint')
          : t('lore.page.selected', { n: selected.length })
      }
      action={
        <Button
          icon={Trash2}
          onClick={() => void trashSelected()}
          disabled={selected.length === 0 || isTrashing}
          aria-busy={isTrashing || undefined}
          data-testid="lore-trash-selected"
        >
          {isTrashing
            ? t('lore.page.moving')
            : selected.length > 0
              ? t('lore.page.moveSelected', { n: selected.length })
              : t('lore.page.moveToTrash')}
        </Button>
      }
      selectedCount={selected.length}
      pageCount={pageItems.length}
      selectPage={selectPage}
      clearSelection={clearSelection}
      onDone={stopSelecting}
      labels={{ selectPage: t('lore.page.selectPage'), clear: t('lore.page.clearSelection') }}
      testIds={{
        bar: 'lore-selectbar',
        count: 'lore-selected-count',
        selectPage: 'lore-select-page',
        clear: 'lore-clear-selection',
        done: 'lore-select-done',
      }}
    />
  )
}
