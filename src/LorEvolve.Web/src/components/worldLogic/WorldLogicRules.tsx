import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t, useI18n } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import type { WorldLogicPage as Page, WorldLogicRuleRow } from '../../worldLogic/types'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from '../Pager'
import { Button } from '../Button'
import { NewButton } from '../NewButton'
import { ReadGate } from '../ReadGate'
import type { Load } from '../../lib/useAsyncRead'
import { LinkRow } from '../LinkRow'
import { DateText } from '../DateText'

/** The Rules tab: world rules and rule definitions in one list, with its empty states and its pager. */
export function WorldLogicRules({
  tab,
  rules,
  base,
  access,
  retry,
  goTo,
}: { rules: Load<Page<WorldLogicRuleRow>> } & Pick<
  ReturnType<typeof worldLogicActions>,
  'retry' | 'goTo'
> & {
    tab: string
    base: string
    access: ReturnType<typeof useUniverseAccess>
  }) {
  const { tx } = useI18n()

  return (
    <TabPanel idPrefix="world-logic" id="rules" tab={tab}>
      <ReadGate
        load={rules}
        loading={{ text: t('canon.rules.loading') }}
        error={{
          message: t('canon.rules.readFailed'),
          onRetry: retry,
          retryLabel: t('canon.rules.retry'),
          testId: 'world-logic-rules-error',
        }}
      >
        {(list) => (
          <>
            {list.items.length > 0 ? (
              <ul className="rulelist" data-testid="world-logic-rule-list">
                {list.items.map((rule) => (
                  <LinkRow
                    look="rule"
                    key={`${rule.source}-${rule.id}`}
                    to={rule.source === 'worldRule' ? `${base}/world-rules/${rule.id}` : undefined}
                    title={rule.title}
                    titleTestId="world-logic-rule-open"
                    excerpt={
                      rule.excerpt ? (
                        <>
                          {rule.excerpt}
                          {rule.isExcerptShortened ? '…' : null}
                        </>
                      ) : null
                    }
                    testId="world-logic-rule-row"
                    data-source={rule.source}
                    data-title={rule.title}
                    meta={
                      <>
                        <span className="rulerow__check" data-testid="world-logic-rule-kind">
                          {rule.source === 'worldRule'
                            ? t('canon.worldLogic.kinds.worldRule')
                            : t('canon.worldLogic.kinds.definition')}
                        </span>
                        {rule.hasCheck ? (
                          <span className="rulerow__check" data-testid="world-logic-rule-has-check">
                            {t('canon.rules.checked')}
                          </span>
                        ) : null}
                        {rule.hasCondition ? (
                          <span
                            className="rulerow__check"
                            data-testid="world-logic-rule-has-condition"
                          >
                            {t('canon.worldLogic.hasCondition')}
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

            {list.totalCount === 0 ? (
              <EmptyState
                testId="world-logic-rules-empty"
                title={t('canon.rules.empty.title')}
                hint={t('canon.rules.empty.hint')}
                action={
                  access.editContent ? (
                    <NewButton to={`${base}/world-rules/new`}>{t('canon.rules.newRule')}</NewButton>
                  ) : undefined
                }
              />
            ) : null}

            {list.items.length === 0 && list.totalCount > 0 ? (
              <EmptyState
                testId="world-logic-rules-page-empty"
                title={t('canon.rules.pageEmpty.title')}
                action={
                  <Button tone="secondary" onClick={() => goTo('rulesPage', 1)}>
                    {t('canon.rules.pageEmpty.first')}
                  </Button>
                }
              />
            ) : null}

            <Pager
              testId="world-logic-rules-pager"
              page={list.page}
              totalPages={list.totalPages}
              onPage={(next) => goTo('rulesPage', next)}
            />
          </>
        )}
      </ReadGate>
    </TabPanel>
  )
}
