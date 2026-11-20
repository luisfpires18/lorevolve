import { Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

type Selection = ReturnType<typeof useLoreSelection>

/** The bar while selecting: how many are selected, Select page, Clear, Move to Trash and Done. */
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
  return (
    <>
      {isSelecting ? (
        <footer className="actionbar lore__selectbar" data-testid="lore-selectbar">
          <QuietNote className="actionbar__status" testId="lore-selected-count" role="status">
            {selected.length === 0
              ? t('lore.page.selectHint')
              : t('lore.page.selected', { n: selected.length })}
          </QuietNote>
          <div className="actions actions--tight actionbar__actions">
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
            <Button
              tone="secondary"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="lore-select-page"
            >
              {t('lore.page.selectPage')}
            </Button>
            <Button
              tone="text"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="lore-clear-selection"
            >
              {t('lore.page.clearSelection')}
            </Button>
            <Button tone="secondary" onClick={stopSelecting} data-testid="lore-select-done">
              {t('shell.actions.done')}
            </Button>
          </div>
        </footer>
      ) : null}
    </>
  )
}
