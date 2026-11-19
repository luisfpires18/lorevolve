import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useWorldLogicState } from '../../worldLogic/useWorldLogicState'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from './Pager'
import { SystemRow } from './SystemRow'
import { Button } from '../Button'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

/** The Systems tab: one row per System, with its empty states and its pager. */
export function WorldLogicSystems({
  tab,
  systems,
  universe,
  retry,
  goTo,
}: Pick<ReturnType<typeof useWorldLogicState>, 'systems'> &
  Pick<ReturnType<typeof worldLogicActions>, 'retry' | 'goTo'> & {
    tab: string
    universe: WorkspaceContext['universe']
  }) {
  return (
    <TabPanel idPrefix="world-logic" id="systems" tab={tab}>
      {systems.kind === 'loading' ? (
        <LoadingNote>{t('canon.worldLogic.systems.loading')}</LoadingNote>
      ) : null}

      {systems.kind === 'error' ? (
        <LoadError
          message={t('canon.worldLogic.systems.readFailed')}
          onRetry={retry}
          retryLabel={t('canon.rules.retry')}
          testId="world-logic-systems-error"
        />
      ) : null}

      {systems.kind === 'ready' && systems.value.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-logic-system-list">
          {systems.value.items.map((system) => (
            <SystemRow key={system.id} universeId={universe.id} system={system} />
          ))}
        </ul>
      ) : null}

      {systems.kind === 'ready' && systems.value.totalCount === 0 ? (
        <EmptyState
          testId="world-logic-systems-empty"
          title={t('canon.worldLogic.systems.empty.title')}
          hint={t('canon.worldLogic.systems.empty.hint')}
        />
      ) : null}

      {systems.kind === 'ready' &&
      systems.value.items.length === 0 &&
      systems.value.totalCount > 0 ? (
        <EmptyState
          testId="world-logic-systems-page-empty"
          title={t('canon.rules.pageEmpty.title')}
          action={
            <Button tone="secondary" onClick={() => goTo('systemsPage', 1)}>
              {t('canon.rules.pageEmpty.first')}
            </Button>
          }
        />
      ) : null}

      {systems.kind === 'ready' ? (
        <Pager
          testId="world-logic-systems-pager"
          page={systems.value.page}
          totalPages={systems.value.totalPages}
          onGo={(next) => goTo('systemsPage', next)}
        />
      ) : null}
    </TabPanel>
  )
}
