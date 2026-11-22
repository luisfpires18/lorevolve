import type { ReactNode } from 'react'
import { StatusBadge } from '../StatusBadge'
import { t, tn } from '../../i18n'
import { MACHINE_MAX_STATES } from '../../worldLogic/types'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { NewButton } from '../NewButton'
import { MachineGroup } from '../SystemMachineTry'
import { LinkRow, RuleList } from '../LinkRow'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>

/** The machine panel's states group: one row per state, and Add state. */
export function MachineStates({
  draft,
  setOpen,
  openItem,
  newStatePlace,
  counts,
  rowError,
}: Pick<State, 'draft' | 'setOpen'> &
  Pick<Actions, 'openItem' | 'newStatePlace'> & {
    counts: Map<string, number>
    rowError: (item: string) => ReactNode
  }) {
  return (
    <MachineGroup
      title={t(`${m}.states`)}
      add={
        <NewButton
          tone="secondary"
          disabled={draft.states.length >= MACHINE_MAX_STATES}
          onClick={() => setOpen({ kind: 'state', id: null, place: newStatePlace() })}
          data-testid="machine-add-state"
        >
          {t(`${m}.addState`)}
        </NewButton>
      }
    >
      {draft.states.length > 0 ? (
        <RuleList testId="machine-state-rows">
          {draft.states.map((state) => {
            const count = counts.get(state.id) ?? 0
            return (
              <LinkRow
                look="rule"
                key={state.id}
                testId="machine-state-row"
                data-state-id={state.id}
                title={state.name}
                titleTestId="machine-state-open"
                openLabel={t(`${m}.editState`, { name: state.name })}
                onOpen={() => openItem({ kind: 'state', id: state.id })}
                meta={
                  <>
                    {t(`${m}.value`, { value: state.value })}
                    {state.initial ? ` · ${t(`${m}.initial`)}` : null}
                    {count ? (
                      <>
                        {' · '}
                        <StatusBadge
                          step={1}
                          label={tn(`${m}.openFindings`, count, { count })}
                          testId="machine-state-row-findings"
                        />
                      </>
                    ) : null}
                  </>
                }
                aside={rowError(state.id)}
              />
            )
          })}
        </RuleList>
      ) : null}
    </MachineGroup>
  )
}
