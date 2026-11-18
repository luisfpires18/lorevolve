import { EmptyState } from '../EmptyState'
import { TabPanel } from '../QueryTabs'
import { t } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useWorldLogicState } from '../../worldLogic/useWorldLogicState'
import type { worldLogicActions } from '../../worldLogic/worldLogicActions'
import { Pager } from './Pager'
import { SystemRow } from './SystemRow'
import { Button } from '../Button'

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
        <p className="notice" role="status">
          {t('canon.worldLogic.systems.loading')}
        </p>
      ) : null}

      {systems.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="world-logic-systems-error">
          <p>{t('canon.worldLogic.systems.readFailed')}</p>
          <Button tone="secondary" onClick={retry}>
            {t('canon.rules.retry')}
          </Button>
        </div>
      ) : null}

      {systems.kind === 'ready' && systems.page.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-logic-system-list">
          {systems.page.items.map((system) => (
            <SystemRow key={system.id} universeId={universe.id} system={system} />
          ))}
        </ul>
      ) : null}

      {systems.kind === 'ready' && systems.page.totalCount === 0 ? (
        <EmptyState
          testId="world-logic-systems-empty"
          title={t('canon.worldLogic.systems.empty.title')}
          hint={t('canon.worldLogic.systems.empty.hint')}
        />
      ) : null}

      {systems.kind === 'ready' &&
      systems.page.items.length === 0 &&
      systems.page.totalCount > 0 ? (
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
          page={systems.page.page}
          totalPages={systems.page.totalPages}
          onGo={(next) => goTo('systemsPage', next)}
        />
      ) : null}
    </TabPanel>
  )
}
