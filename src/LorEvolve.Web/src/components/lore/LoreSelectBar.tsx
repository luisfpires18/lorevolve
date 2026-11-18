import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import type { useLoreSelection } from '../../lore/useLoreSelection'

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
          <p className="actionbar__status" role="status" data-testid="lore-selected-count">
            {selected.length === 0
              ? t('lore.page.selectHint')
              : t('lore.page.selected', { n: selected.length })}
          </p>
          <div className="actionbar__actions">
            <button
              className="button"
              type="button"
              onClick={() => void trashSelected()}
              disabled={selected.length === 0 || isTrashing}
              aria-busy={isTrashing || undefined}
              data-testid="lore-trash-selected"
            >
              <ActionIcon icon={Trash2} />
              {isTrashing
                ? t('lore.page.moving')
                : selected.length > 0
                  ? t('lore.page.moveSelected', { n: selected.length })
                  : t('lore.page.moveToTrash')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="lore-select-page"
            >
              {t('lore.page.selectPage')}
            </button>
            <button
              className="button button--text"
              type="button"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="lore-clear-selection"
            >
              {t('lore.page.clearSelection')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={stopSelecting}
              data-testid="lore-select-done"
            >
              {t('lore.page.done')}
            </button>
          </div>
        </footer>
      ) : null}
    </>
  )
}
