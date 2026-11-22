import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useI18n } from '../i18n'
import { ActionIcon } from './ActionIcon'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

/**
 * Previous, the position, Next: the pages of a list whose API says how many there are. Draws nothing for one page,
 * so a caller does not guard it. A list with no count continues with `ShowMore` instead.
 * `testId` is on the nav; the buttons are `${testId}-previous` and `${testId}-next`.
 */
export function Pager({
  page,
  totalPages,
  onPage,
  disabled,
  testId,
}: {
  page: number
  totalPages: number
  onPage: (next: number) => void
  /** While the list is busy: both buttons wait. */
  disabled?: boolean
  testId?: string
}) {
  const { t } = useI18n()
  if (totalPages <= 1) return null

  return (
    <nav className="pager" aria-label={t('shell.pager.label')} data-testid={testId}>
      <Button
        tone="secondary"
        icon={ArrowLeft}
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
        data-testid={testId ? `${testId}-previous` : undefined}
      >
        {t('shell.pager.previous')}
      </Button>
      <span className="pager__position">
        {t('shell.pager.position', { page, total: totalPages })}
      </span>
      <Button
        tone="secondary"
        disabled={disabled || page >= totalPages}
        onClick={() => onPage(page + 1)}
        data-testid={testId ? `${testId}-next` : undefined}
      >
        {t('shell.pager.next')}
        <ActionIcon icon={ArrowRight} />
      </Button>
    </nav>
  )
}

type PageOf<T> = { items: readonly T[]; page: number; totalPages: number }

type PagedListProps<T> = {
  /** The row, with its own key. */
  renderItem: (item: T) => ReactNode
  listClassName: string
  listTestId: string
  /** The caller's own empty state, drawn as is. */
  empty: ReactNode
  /** The pager's, and the first page button's. */
  onPage: (next: number) => void
  pagerTestId?: string
  disabled?: boolean
  // A list with a page-empty state needs the whole list's count, to tell a page past the end from an empty list.
} & (
  | { result: PageOf<T> & { totalCount: number }; pageEmptyTestId: string }
  | { result: PageOf<T> & { totalCount?: number }; pageEmptyTestId?: undefined }
)

/**
 * A page's tail: the list when the page has rows, `empty` when it has none, then the pager. With `pageEmptyTestId`, a
 * page past the end of a list that is not empty says so, with the way to the first page, instead of `empty`.
 */
export function PagedList<T>({
  result,
  renderItem,
  listClassName,
  listTestId,
  empty,
  pageEmptyTestId,
  onPage,
  pagerTestId,
  disabled,
}: PagedListProps<T>) {
  const { t } = useI18n()
  const noRows = result.items.length === 0
  const pastTheEnd = pageEmptyTestId !== undefined && (result.totalCount ?? 0) > 0

  return (
    <>
      {noRows ? null : (
        <ul className={listClassName} data-testid={listTestId}>
          {result.items.map((item) => renderItem(item))}
        </ul>
      )}
      {noRows && !pastTheEnd ? empty : null}
      {noRows && pastTheEnd ? (
        <EmptyState
          testId={pageEmptyTestId}
          title={t('canon.rules.pageEmpty.title')}
          action={
            <Button tone="secondary" onClick={() => onPage(1)}>
              {t('canon.rules.pageEmpty.first')}
            </Button>
          }
        />
      ) : null}
      <Pager
        page={result.page}
        totalPages={result.totalPages}
        onPage={onPage}
        disabled={disabled}
        testId={pagerTestId}
      />
    </>
  )
}
