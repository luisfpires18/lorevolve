import type { IdeaPage } from '../../ideas/types'
import { useI18n } from '../../i18n'

/** An ideas list's previous and next pages. */
export function IdeasPager({
  result,
  update,
}: {
  result: IdeaPage
  update: (change: Record<string, string | null>) => void
}) {
  const { t } = useI18n()
  return (
    <nav className="pager" aria-label={t('ideas.browser.pagination')}>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page <= 1}
        onClick={() => update({ page: String(result.page - 1) })}
      >
        {t('ideas.browser.previous')}
      </button>
      <span className="pager__position">
        {t('ideas.browser.position', { page: result.page, total: result.totalPages })}
      </span>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page >= result.totalPages}
        onClick={() => update({ page: String(result.page + 1) })}
      >
        {t('ideas.browser.next')}
      </button>
    </nav>
  )
}
