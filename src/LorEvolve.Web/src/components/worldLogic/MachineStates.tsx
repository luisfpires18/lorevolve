import type { ReactNode } from 'react'
import { StatusBadge } from '../StatusBadge'
import { t, tn } from '../../i18n'
import { MACHINE_MAX_STATES } from '../../worldLogic/types'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { NewButton } from '../NewButton'

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
    <section className="machinepanel__group">
      <h2 className="sectionrule">{t(`${m}.states`)}</h2>
      {draft.states.length > 0 ? (
        <ul className="rulelist" data-testid="machine-state-rows">
          {draft.states.map((state) => {
            const count = counts.get(state.id) ?? 0
            return (
              <li
                className="rulerow"
                key={state.id}
                data-testid="machine-state-row"
                data-state-id={state.id}
              >
                <button
                  className="rulerow__title rulerow__toggle"
                  type="button"
                  aria-label={t(`${m}.editState`, { name: state.name })}
                  onClick={() => openItem({ kind: 'state', id: state.id })}
                  data-testid="machine-state-open"
                >
                  <bdi>{state.name}</bdi>
                </button>
                <p className="rulerow__meta">
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
                </p>
                {rowError(state.id)}
              </li>
            )
          })}
        </ul>
      ) : null}
      <div className="form__actions">
        <NewButton
          tone="secondary"
          disabled={draft.states.length >= MACHINE_MAX_STATES}
          onClick={() => setOpen({ kind: 'state', id: null, place: newStatePlace() })}
          data-testid="machine-add-state"
        >
          {t(`${m}.addState`)}
        </NewButton>
      </div>
    </section>
  )
}
