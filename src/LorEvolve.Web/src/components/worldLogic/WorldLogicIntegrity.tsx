import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t, useI18n } from '../../i18n'
import { formatDateTime } from '../../lib/dates'
import type { useUniverseAccess } from '../../universes/access'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useWorldLogicState } from '../../worldLogic/useWorldLogicState'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from './Pager'
import { FindingRow } from './FindingRow'
import { Button } from '../Button'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

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
}: Pick<ReturnType<typeof useWorldLogicState>, 'findings' | 'sweep' | 'sweeping' | 'sweepFailed'> &
  Pick<ReturnType<typeof worldLogicActions>, 'retry' | 'check' | 'reread' | 'goTo'> & {
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
        <p
          className="notice notice--error"
          role="alert"
          data-testid="world-logic-integrity-check-error"
        >
          {t('canon.worldLogic.integrity.checkFailed')}
        </p>
      ) : null}

      {sweep ? (
        <p className="notice" data-testid="world-logic-integrity-checked">
          {tx('canon.worldLogic.integrity.checked', {
            time: <time dateTime={sweep.evaluatedAt}>{formatDateTime(sweep.evaluatedAt)}</time>,
          })}
        </p>
      ) : null}

      {sweep?.isTruncated ? (
        <p
          className="notice notice--error"
          role="status"
          data-testid="world-logic-integrity-truncated"
        >
          {t('canon.worldLogic.integrity.truncated')}
        </p>
      ) : null}

      {findings.kind === 'loading' ? (
        <LoadingNote>{t('canon.worldLogic.integrity.loading')}</LoadingNote>
      ) : null}

      {findings.kind === 'error' ? (
        <LoadError
          message={t('canon.worldLogic.integrity.readFailed')}
          onRetry={retry}
          retryLabel={t('canon.rules.retry')}
          testId="world-logic-findings-error"
        />
      ) : null}

      {findings.kind === 'ready' && findings.page.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-logic-finding-list">
          {findings.page.items.map((finding) => (
            <FindingRow
              key={finding.id}
              universeId={universe.id}
              finding={finding}
              canDecide={access.editContent}
              onDecided={reread}
            />
          ))}
        </ul>
      ) : null}

      {findings.kind === 'ready' && findings.page.totalCount === 0 ? (
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
            <Button tone="secondary" to={`${base}/canon`} data-testid="world-logic-canon-link">
              {t('canon.worldLogic.integrity.canonLink')}
            </Button>
          }
        />
      ) : null}

      {findings.kind === 'ready' &&
      findings.page.items.length === 0 &&
      findings.page.totalCount > 0 ? (
        <EmptyState
          testId="world-logic-findings-page-empty"
          title={t('canon.rules.pageEmpty.title')}
          action={
            <Button tone="secondary" onClick={() => goTo('findingsPage', 1)}>
              {t('canon.rules.pageEmpty.first')}
            </Button>
          }
        />
      ) : null}

      {findings.kind === 'ready' ? (
        <Pager
          testId="world-logic-findings-pager"
          page={findings.page.page}
          totalPages={findings.page.totalPages}
          onGo={(next) => goTo('findingsPage', next)}
        />
      ) : null}
    </TabPanel>
  )
}
