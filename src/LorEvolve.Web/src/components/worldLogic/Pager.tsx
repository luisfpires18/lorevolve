import { t } from '../../i18n'

/**
 * One list's pages, drawn only when there is more than one. The same shape the rule book's own pager has, so the two
 * read the same way; each list on this page has its own, because each has its own page in the address.
 */
export function Pager({
  testId,
  page,
  totalPages,
  onGo,
}: {
  testId: string
  page: number
  totalPages: number
  onGo: (next: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <nav className="pager" aria-label={t('canon.rules.pagination')} data-testid={testId}>
      <button
        className="button button--secondary"
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
      >
        {t('canon.rules.previous')}
      </button>
      <span className="pager__position">{t('canon.rules.position', { page, totalPages })}</span>
      <button
        className="button button--secondary"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
      >
        {t('canon.rules.next')}
      </button>
    </nav>
  )
}
