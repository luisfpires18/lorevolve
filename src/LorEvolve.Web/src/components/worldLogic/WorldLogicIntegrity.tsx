import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t, useI18n } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useWorldLogicState } from '../../worldLogic/useWorldLogicState'
import type { WorldLogicFindingRow, WorldLogicPage as Page } from '../../worldLogic/types'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { PagedList } from '../Pager'
import { FindingRow } from './FindingRow'
import { Button } from '../Button'
import { ReadGate } from '../ReadGate'
import type { Load } from '../../lib/useAsyncRead'
import { DateText } from '../DateText'
import { Callout } from '../Callout'

/** The Integrity tab: the check and what it last said, one row per finding, the empty states and the pager. */
export function WorldLogicIntegrity({
  tab,
  findings,
  sweep,
  sweeping,
  sweepFailed,
  universe,
  base,
  access,
  retry,
  check,
  reread,
  goTo,
}: Pick<ReturnType<typeof useWorldLogicState>, 'sweep' | 'sweeping' | 'sweepFailed'> & {
  findings: Load<Page<WorldLogicFindingRow>>
} & Pick<ReturnType<typeof worldLogicActions>, 'retry' | 'check' | 'reread' | 'goTo'> & {
    tab: string
    universe: WorkspaceContext['universe']
    base: string
    access: ReturnType<typeof useUniverseAccess>
  }) {
  const { tx } = useI18n()

  return (
    <TabPanel idPrefix="world-logic" id="integrity" tab={tab}>
      {/* Checking writes the findings, so it is editing (ADR 0041); everyone reads what the last check found. */}
      {access.editContent ? (
        <div className="controls">
          <Button
            tone="secondary"
            busy={sweeping}
            busyLabel={t('canon.worldLogic.integrity.checking')}
            onClick={() => void check()}
            data-testid="world-logic-integrity-check"
          >
            {t('canon.worldLogic.integrity.check')}
          </Button>
        </div>
      ) : null}

      {sweepFailed ? (
        <Callout
          look="notice"
          tone="error"
          as="p"
          role="alert"
          testId="world-logic-integrity-check-error"
        >
          {t('canon.worldLogic.integrity.checkFailed')}
        </Callout>
      ) : null}

      {sweep ? (
        <Callout look="notice" as="p" testId="world-logic-integrity-checked">
          {tx('canon.worldLogic.integrity.checked', {
            time: <DateText value={sweep.evaluatedAt} withTime />,
          })}
        </Callout>
      ) : null}

      {sweep?.isTruncated ? (
        <Callout
          look="notice"
          tone="error"
          as="p"
          role="status"
          testId="world-logic-integrity-truncated"
        >
          {t('canon.worldLogic.integrity.truncated')}
        </Callout>
      ) : null}

      <ReadGate
        load={findings}
        loading={{ text: t('canon.worldLogic.integrity.loading') }}
        error={{
          message: t('canon.worldLogic.integrity.readFailed'),
          onRetry: retry,
          retryLabel: t('canon.rules.retry'),
          testId: 'world-logic-findings-error',
        }}
      >
        {(list) => (
          <PagedList
            result={list}
            renderItem={(finding) => (
              <FindingRow
                key={finding.id}
                universeId={universe.id}
                finding={finding}
                canDecide={access.editContent}
                onDecided={reread}
              />
            )}
            listClassName="rulelist"
            listTestId="world-logic-finding-list"
            empty={
              <EmptyState
                testId={sweep ? 'world-logic-integrity-passed' : 'world-logic-integrity-empty'}
                title={
                  sweep
                    ? t('canon.worldLogic.integrity.passed.title')
                    : t('canon.worldLogic.integrity.empty.title')
                }
                hint={
                  sweep
                    ? t('canon.worldLogic.integrity.passed.hint')
                    : t('canon.worldLogic.integrity.empty.hint')
                }
                action={
                  <Button
                    tone="secondary"
                    to={`${base}/canon`}
                    data-testid="world-logic-canon-link"
                  >
                    {t('canon.worldLogic.integrity.canonLink')}
                  </Button>
                }
              />
            }
            pageEmptyTestId="world-logic-findings-page-empty"
            pagerTestId="world-logic-findings-pager"
            onPage={(next) => goTo('findingsPage', next)}
          />
        )}
      </ReadGate>
    </TabPanel>
  )
}
