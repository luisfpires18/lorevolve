import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { SystemSummary, WorldLogicPage as Page } from '../../worldLogic/types'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from '../Pager'
import { SystemRow } from './SystemRow'
import { Button } from '../Button'
import { ReadGate } from '../ReadGate'
import type { Load } from '../../lib/useAsyncRead'

/** The Systems tab: one row per System, with its empty states and its pager. */
export function WorldLogicSystems({
  tab,
  systems,
  universe,
  retry,
  goTo,
}: { systems: Load<Page<SystemSummary>> } & Pick<
  ReturnType<typeof worldLogicActions>,
  'retry' | 'goTo'
> & {
    tab: string
    universe: WorkspaceContext['universe']
  }) {
  return (
    <TabPanel idPrefix="world-logic" id="systems" tab={tab}>
      <ReadGate
        load={systems}
        loading={{ text: t('canon.worldLogic.systems.loading') }}
        error={{
          message: t('canon.worldLogic.systems.readFailed'),
          onRetry: retry,
          retryLabel: t('canon.rules.retry'),
          testId: 'world-logic-systems-error',
        }}
      >
        {(list) => (
          <>
            {list.items.length > 0 ? (
              <ul className="rulelist" data-testid="world-logic-system-list">
                {list.items.map((system) => (
                  <SystemRow key={system.id} universeId={universe.id} system={system} />
                ))}
              </ul>
            ) : null}

            {list.totalCount === 0 ? (
              <EmptyState
                testId="world-logic-systems-empty"
                title={t('canon.worldLogic.systems.empty.title')}
                hint={t('canon.worldLogic.systems.empty.hint')}
              />
            ) : null}

            {list.items.length === 0 && list.totalCount > 0 ? (
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

            <Pager
              testId="world-logic-systems-pager"
              page={list.page}
              totalPages={list.totalPages}
              onPage={(next) => goTo('systemsPage', next)}
            />
          </>
        )}
      </ReadGate>
    </TabPanel>
  )
}
