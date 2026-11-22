import { DateText } from '../DateText'
import { EmptyState } from '../EmptyState'
import { LinkRow } from '../LinkRow'
import { NewButton } from '../NewButton'
import { PagedList } from '../Pager'
import { t, tx, useI18n } from '../../i18n'
import type { WorldRulePage, WorldRuleSummary } from '../../worldRules/types'

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
    <PagedList
      result={result}
      renderItem={(rule) => (
        <WorldRuleRow
          key={rule.id}
          rule={rule}
          to={`${basePath}/${rule.id}`}
          ids={{
            row: 'world-rule-row',
            open: 'world-rule-open',
            excerpt: 'world-rule-excerpt',
            hasCheck: 'world-rule-has-check',
          }}
          data-title={rule.title}
        />
      )}
      listClassName="rulelist"
      listTestId="world-rule-list"
      empty={
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
      }
      pageEmptyTestId="world-rules-page-empty"
      onPage={onPage}
    />
  )
}

/**
 * One rule row of the World Rules list and the World Logic Rules tab: the title (a link with `to`, text without, as for
 * a rule definition), what it says, then the meta: the `kind` chip when given, the check chip, the condition chip, and
 * when it changed. The test ids are passed whole; the caller keeps its own `key`.
 */
export function WorldRuleRow({
  rule,
  to,
  ids,
  kind,
  ...data
}: {
  rule: Pick<
    WorldRuleSummary,
    'title' | 'excerpt' | 'isExcerptShortened' | 'hasCheck' | 'updatedAt'
  > & { hasCondition?: boolean }
  to?: string
  ids: {
    row: string
    open: string
    excerpt?: string
    hasCheck: string
    hasCondition?: string
    kind?: string
  }
  kind?: string
  [dataAttribute: `data-${string}`]: string | undefined
}) {
  useI18n()
  return (
    <LinkRow
      look="rule"
      to={to}
      title={rule.title}
      titleTestId={ids.open}
      excerpt={rule.excerpt}
      excerptShortened={rule.isExcerptShortened}
      excerptTestId={ids.excerpt}
      testId={ids.row}
      {...data}
      meta={
        <>
          {kind !== undefined ? (
            <span className="rulerow__check" data-testid={ids.kind}>
              {kind}
            </span>
          ) : null}
          {rule.hasCheck ? (
            <span className="rulerow__check" data-testid={ids.hasCheck}>
              {t('canon.rules.checked')}
            </span>
          ) : null}
          {rule.hasCondition ? (
            <span className="rulerow__check" data-testid={ids.hasCondition}>
              {t('canon.worldLogic.hasCondition')}
            </span>
          ) : null}
          {tx('canon.rules.updated', {
            time: <DateText value={rule.updatedAt} />,
          })}
        </>
      }
    />
  )
}
