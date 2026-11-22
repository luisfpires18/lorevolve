import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t, useI18n } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import type { WorldLogicPage as Page, WorldLogicRuleRow } from '../../worldLogic/types'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { PagedList } from '../Pager'
import { NewButton } from '../NewButton'
import { ReadGate } from '../ReadGate'
import type { Load } from '../../lib/useAsyncRead'
import { WorldRuleRow } from '../worldRules/WorldRulesList'

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
  useI18n() // Re-renders on a language change; the words are read through the module's t.

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
          <PagedList
            result={list}
            renderItem={(rule) => (
              <WorldRuleRow
                key={`${rule.source}-${rule.id}`}
                rule={rule}
                to={rule.source === 'worldRule' ? `${base}/world-rules/${rule.id}` : undefined}
                kind={
                  rule.source === 'worldRule'
                    ? t('canon.worldLogic.kinds.worldRule')
                    : t('canon.worldLogic.kinds.definition')
                }
                ids={{
                  row: 'world-logic-rule-row',
                  open: 'world-logic-rule-open',
                  hasCheck: 'world-logic-rule-has-check',
                  hasCondition: 'world-logic-rule-has-condition',
                  kind: 'world-logic-rule-kind',
                }}
                data-source={rule.source}
                data-title={rule.title}
              />
            )}
            listClassName="rulelist"
            listTestId="world-logic-rule-list"
            empty={
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
            }
            pageEmptyTestId="world-logic-rules-page-empty"
            pagerTestId="world-logic-rules-pager"
            onPage={(next) => goTo('rulesPage', next)}
          />
        )}
      </ReadGate>
    </TabPanel>
  )
}
