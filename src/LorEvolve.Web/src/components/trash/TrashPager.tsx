import { t } from '../../i18n'
import type { TrashPage } from '../../trash/types'
import type { useTrashState } from '../../trash/useTrashState'

/** Previous and Next through the Trash's pages, held still while a selection is being erased. */
export function TrashPager({
  result,
  selectionLocked,
  setPage,
}: Pick<ReturnType<typeof useTrashState>, 'setPage'> & {
  result: TrashPage
  selectionLocked: boolean
}) {
  return (
    <nav className="pager" aria-label={t('data.trash.pager.label')}>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page <= 1 || selectionLocked}
        onClick={() => setPage((current) => current - 1)}
      >
        {t('data.trash.pager.previous')}
      </button>
      <span className="pager__position">
        {t('data.trash.pager.position', { page: result.page, total: result.totalPages })}
      </span>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page >= result.totalPages || selectionLocked}
        onClick={() => setPage((current) => current + 1)}
      >
        {t('data.trash.pager.next')}
      </button>
    </nav>
  )
}
