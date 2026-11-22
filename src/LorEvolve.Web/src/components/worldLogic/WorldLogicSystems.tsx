import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { SystemSummary, WorldLogicPage as Page } from '../../worldLogic/types'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { PagedList } from '../Pager'
import { SystemRow } from './SystemRow'
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
          <PagedList
            result={list}
            renderItem={(system) => (
              <SystemRow key={system.id} universeId={universe.id} system={system} />
            )}
            listClassName="rulelist"
            listTestId="world-logic-system-list"
            empty={
              <EmptyState
                testId="world-logic-systems-empty"
                title={t('canon.worldLogic.systems.empty.title')}
                hint={t('canon.worldLogic.systems.empty.hint')}
              />
            }
            pageEmptyTestId="world-logic-systems-page-empty"
            pagerTestId="world-logic-systems-pager"
            onPage={(next) => goTo('systemsPage', next)}
          />
        )}
      </ReadGate>
    </TabPanel>
  )
}
