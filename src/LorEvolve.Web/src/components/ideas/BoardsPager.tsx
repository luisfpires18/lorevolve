import type { IdeaBoardPage } from '../../ideas/boards'
import { useI18n } from '../../i18n'
import { Button } from '../Button'

/** The boards list's previous and next pages. */
export function BoardsPager({
  result,
  update,
}: {
  result: IdeaBoardPage
  update: (change: Record<string, string | null>) => void
}) {
  const { t } = useI18n()
  return (
    <nav className="pager" aria-label={t('ideas.boards.pagination')}>
      <Button
        tone="secondary"
        disabled={result.page <= 1}
        onClick={() => update({ page: String(result.page - 1) })}
      >
        {t('ideas.boards.previous')}
      </Button>
      <span className="pager__position">
        {t('ideas.boards.position', { page: result.page, total: result.totalPages })}
      </span>
      <Button
        tone="secondary"
        disabled={result.page >= result.totalPages}
        onClick={() => update({ page: String(result.page + 1) })}
      >
        {t('ideas.boards.next')}
      </Button>
    </nav>
  )
}
