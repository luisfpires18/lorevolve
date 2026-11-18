import { EmptyState } from '../EmptyState'
import type { IdeasScope } from '../../ideas/types'
import { useI18n } from '../../i18n'
import { NewButton } from '../NewButton'

/** What an ideas list says when it has no ideas to show. */
export function IdeasEmpty({
  deleted,
  isFiltered,
  scope,
  basePath,
}: {
  deleted: boolean
  isFiltered: boolean
  scope: IdeasScope
  basePath: string
}) {
  const { t } = useI18n()
  return deleted ? (
    <EmptyState
      testId="ideas-empty"
      title={t('ideas.browser.empty.deletedTitle')}
      hint={t('ideas.browser.empty.deletedHint')}
    />
  ) : isFiltered ? (
    <EmptyState
      testId="ideas-empty"
      title={t('ideas.browser.empty.filteredTitle')}
      hint={t('ideas.browser.empty.filteredHint')}
    />
  ) : scope.kind === 'story' ? (
    <EmptyState
      testId="ideas-empty"
      title={t('ideas.browser.empty.storyTitle')}
      hint={t('ideas.browser.empty.storyHint')}
    />
  ) : scope.kind === 'project' ? (
    <EmptyState
      testId="ideas-empty"
      title={t('ideas.browser.empty.projectTitle')}
      hint={t('ideas.browser.empty.projectHint')}
    />
  ) : (
    <EmptyState
      testId="ideas-empty"
      title={t('ideas.browser.empty.noneTitle')}
      hint={t('ideas.browser.empty.noneHint')}
      action={
        <NewButton to={`${basePath}/new`} data-testid="empty-new-idea">
          {t('ideas.browser.newIdea')}
        </NewButton>
      }
    />
  )
}
