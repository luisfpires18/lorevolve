import {
  addState,
  addTransition,
  removeState,
  removeTransition,
  updateState,
  updateTransition,
  type MachineTransition,
} from '../../worldLogic/machine'
import type { SystemMachineState } from '../../worldLogic/types'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { StateDrawer } from './StateDrawer'
import { TransitionDrawer } from './TransitionDrawer'
import { BindingDrawer } from './BindingDrawer'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>

/** The machine panel's drawers: the open state, transition or binding. */
export function MachineDrawers({
  universeId,
  projectId,
  open,
  setOpen,
  draft,
  errors,
  rules,
  setRules,
  setSelected,
  edit,
  openState,
  openTransition,
}: Pick<State, 'open' | 'setOpen' | 'draft' | 'errors' | 'rules' | 'setRules' | 'setSelected'> &
  Pick<Actions, 'edit'> & {
    universeId: string
    projectId: string | null
    openState: SystemMachineState | undefined
    openTransition: MachineTransition | undefined
  }) {
  return (
    <>
      {open?.kind === 'state' && (open.id === null || openState) ? (
        <StateDrawer
          key={open.id ?? 'new'}
          state={openState ?? null}
          place={open.place ?? null}
          isFirst={draft.states.length === 0}
          errors={openState ? errors[openState.id] : undefined}
          onApply={(values) => {
            if (openState) {
              edit((doc) => updateState(doc, openState.id, values), openState.id)
            } else {
              const id = crypto.randomUUID()
              edit((doc) => addState(doc, { id, ...values }))
              setSelected({ kind: 'state', id })
            }
            setOpen(null)
          }}
          onDelete={
            openState
              ? () => {
                  edit((doc) => removeState(doc, openState.id), openState.id)
                  setOpen(null)
                }
              : undefined
          }
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'transition' && (open.id === null || openTransition) ? (
        <TransitionDrawer
          key={open.id ?? 'new'}
          transition={openTransition ?? null}
          states={draft.states}
          rules={rules}
          universeId={universeId}
          projectId={projectId}
          onRuleSaved={(rule) =>
            setRules((current) =>
              Array.isArray(current)
                ? current.some((each) => each.id === rule.id)
                  ? current.map((each) => (each.id === rule.id ? rule : each))
                  : [...current, rule]
                : current === null
                  ? [rule]
                  : current,
            )
          }
          errors={openTransition ? errors[openTransition.id] : undefined}
          onApply={(values) => {
            if (openTransition) {
              edit((doc) => updateTransition(doc, openTransition.id, values), openTransition.id)
            } else {
              const id = crypto.randomUUID()
              edit((doc) => addTransition(doc, { id, ...values }))
              setSelected({ kind: 'transition', id })
            }
            setOpen(null)
          }}
          onDelete={
            openTransition
              ? () => {
                  edit((doc) => removeTransition(doc, openTransition.id), openTransition.id)
                  setOpen(null)
                }
              : undefined
          }
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'binding' ? (
        <BindingDrawer
          binding={draft.binding}
          errors={errors.binding}
          onApply={(binding) => {
            edit((doc) => ({ ...doc, binding }), 'binding')
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}
