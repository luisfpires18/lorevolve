import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { ActionIcon } from '../ActionIcon'
import type { IdeasScope } from '../../ideas/types'
import { useI18n } from '../../i18n'

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
        <Link className="button" to={`${basePath}/new`} data-testid="empty-new-idea">
          <ActionIcon icon={Plus} />
          {t('ideas.browser.newIdea')}
        </Link>
      }
    />
  )
}
