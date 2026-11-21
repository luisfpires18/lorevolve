import { DateText } from '../DateText'
import { Button } from '../Button'
import { EmptyState } from '../EmptyState'
import { LinkRow } from '../LinkRow'
import { NewButton } from '../NewButton'
import { Pager } from '../Pager'
import { t, tx, useI18n } from '../../i18n'
import type { WorldRulePage } from '../../worldRules/types'

/**
 * One page of a universe's World Rules (ADR 0033): each rule by title with a line of what it says and whether it has a
 * timeline check, or the empty state (with New rule for an editor), or a page past the end with the way to the first;
 * then the pager.
 */
export function WorldRulesList({
  result,
  basePath,
  canCreate,
  onPage,
}: {
  result: WorldRulePage
  basePath: string
  canCreate: boolean
  onPage: (page: number) => void
}) {
  useI18n()
  return (
    <>
      {result.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-rule-list">
          {result.items.map((rule) => (
            <LinkRow
              look="rule"
              key={rule.id}
              to={`${basePath}/${rule.id}`}
              title={rule.title}
              titleTestId="world-rule-open"
              excerpt={
                rule.excerpt ? (
                  <>
                    {rule.excerpt}
                    {rule.isExcerptShortened ? '…' : null}
                  </>
                ) : null
              }
              excerptTestId="world-rule-excerpt"
              testId="world-rule-row"
              data-title={rule.title}
              meta={
                <>
                  {rule.hasCheck ? (
                    <span className="rulerow__check" data-testid="world-rule-has-check">
                      {t('canon.rules.checked')}
                    </span>
                  ) : null}
                  {tx('canon.rules.updated', {
                    time: <DateText value={rule.updatedAt} />,
                  })}
                </>
              }
            />
          ))}
        </ul>
      ) : null}

      {result.items.length === 0 && result.totalCount === 0 ? (
        <EmptyState
          testId="world-rules-empty"
          title={t('canon.rules.empty.title')}
          hint={t('canon.rules.empty.hint')}
          action={
            canCreate ? (
              <NewButton to={`${basePath}/new`} data-testid="empty-new-world-rule">
                {t('canon.rules.emptyNewRule')}
              </NewButton>
            ) : undefined
          }
        />
      ) : null}

      {result.items.length === 0 && result.totalCount > 0 ? (
        <EmptyState
          testId="world-rules-page-empty"
          title={t('canon.rules.pageEmpty.title')}
          action={
            <Button tone="secondary" onClick={() => onPage(1)}>
              {t('canon.rules.pageEmpty.first')}
            </Button>
          }
        />
      ) : null}

      <Pager page={result.page} totalPages={result.totalPages} onPage={onPage} />
    </>
  )
}
