import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t, useI18n } from '../../i18n'
import { formatDate } from '../../lib/dates'
import type { useUniverseAccess } from '../../universes/access'
import type { useWorldLogicState } from '../../worldLogic/useWorldLogicState'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from './Pager'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

/** The Rules tab: world rules and rule definitions in one list, with its empty states and its pager. */
export function WorldLogicRules({
  tab,
  rules,
  base,
  access,
  retry,
  goTo,
}: Pick<ReturnType<typeof useWorldLogicState>, 'rules'> &
  Pick<ReturnType<typeof worldLogicActions>, 'retry' | 'goTo'> & {
    tab: string
    base: string
    access: ReturnType<typeof useUniverseAccess>
  }) {
  const { tx } = useI18n()

  return (
    <TabPanel idPrefix="world-logic" id="rules" tab={tab}>
      {rules.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('canon.rules.loading')}
        </p>
      ) : null}

      {rules.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="world-logic-rules-error">
          <p>{t('canon.rules.readFailed')}</p>
          <Button tone="secondary" onClick={retry}>
            {t('canon.rules.retry')}
          </Button>
        </div>
      ) : null}

      {rules.kind === 'ready' && rules.page.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-logic-rule-list">
          {rules.page.items.map((rule) => (
            <li
              className={rule.source === 'worldRule' ? 'rulerow rowlink' : 'rulerow'}
              key={`${rule.source}-${rule.id}`}
              data-testid="world-logic-rule-row"
              data-source={rule.source}
              data-title={rule.title}
            >
              {rule.source === 'worldRule' ? (
                <Link
                  className="rulerow__title rowlink__target"
                  to={`${base}/world-rules/${rule.id}`}
                  data-testid="world-logic-rule-open"
                >
                  <bdi>{rule.title}</bdi>
                </Link>
              ) : (
                <p className="rulerow__title">
                  <bdi>{rule.title}</bdi>
                </p>
              )}

              {rule.excerpt ? (
                <p className="rulerow__excerpt" dir="auto">
                  {rule.excerpt}
                  {rule.isExcerptShortened ? '…' : null}
                </p>
              ) : null}

              <p className="rulerow__meta">
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
                  <span className="rulerow__check" data-testid="world-logic-rule-has-condition">
                    {t('canon.worldLogic.hasCondition')}
                  </span>
                ) : null}
                {tx('canon.rules.updated', {
                  time: <time dateTime={rule.updatedAt}>{formatDate(rule.updatedAt)}</time>,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {rules.kind === 'ready' && rules.page.totalCount === 0 ? (
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

      {rules.kind === 'ready' && rules.page.items.length === 0 && rules.page.totalCount > 0 ? (
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

      {rules.kind === 'ready' ? (
        <Pager
          testId="world-logic-rules-pager"
          page={rules.page.page}
          totalPages={rules.page.totalPages}
          onGo={(next) => goTo('rulesPage', next)}
        />
      ) : null}
    </TabPanel>
  )
}
