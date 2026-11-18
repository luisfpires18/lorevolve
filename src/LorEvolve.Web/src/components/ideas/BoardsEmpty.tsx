import { EmptyState } from '../EmptyState'
import { useI18n } from '../../i18n'
import { NewButton } from '../NewButton'

/** What the boards list says when it has no boards to show. */
export function BoardsEmpty({
  deleted,
  isFiltered,
  basePath,
}: {
  deleted: boolean
  isFiltered: boolean
  basePath: string
}) {
  const { t } = useI18n()
  return deleted ? (
    <EmptyState
      testId="boards-empty"
      title={t('ideas.boards.empty.deletedTitle')}
      hint={t('ideas.boards.empty.deletedHint')}
    />
  ) : isFiltered ? (
    <EmptyState
      testId="boards-empty"
      title={t('ideas.boards.empty.filteredTitle')}
      hint={t('ideas.boards.empty.filteredHint')}
    />
  ) : (
    <EmptyState
      testId="boards-empty"
      title={t('ideas.boards.empty.noneTitle')}
      hint={t('ideas.boards.empty.noneHint')}
      action={
        <NewButton to={`${basePath}/new`} data-testid="empty-new-board">
          {t('ideas.boards.newBoard')}
        </NewButton>
      }
    />
  )
}
