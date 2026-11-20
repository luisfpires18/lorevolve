import type { ReactNode } from 'react'
import { GuardMark } from '../SystemMachineTry'
import { t } from '../../i18n'
import type { MachineTransition } from '../../worldLogic/machine'
import { MACHINE_MAX_TRANSITIONS } from '../../worldLogic/types'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { QuietNote } from '../QuietNote'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>
import type { GuardMarkValue } from '../../worldLogic/markText'
import { NewButton } from '../NewButton'

/** The machine panel's transitions group: one row per transition with its guard, and Add transition. */
export function MachineTransitions({
  draft,
  setOpen,
  openItem,
  pairName,
  ruleTitle,
  marks,
  rowError,
}: Pick<State, 'draft' | 'setOpen'> &
  Pick<Actions, 'openItem'> & {
    pairName: (transition: MachineTransition) => string
    ruleTitle: Map<string, string>
    marks: Map<string, GuardMarkValue>
    rowError: (item: string) => ReactNode
  }) {
  return (
    <section className="machinepanel__group">
      <h2 className="sectionrule">{t(`${m}.transitions`)}</h2>
      {draft.transitions.length > 0 ? (
        <ul className="rulelist" data-testid="machine-transition-rows">
          {draft.transitions.map((transition) => {
            const name = transition.label.trim() || pairName(transition)
            return (
              <li
                className="rulerow"
                key={transition.id}
                data-testid="machine-transition-row"
                data-transition-id={transition.id}
              >
                <button
                  className="rulerow__title rulerow__toggle"
                  type="button"
                  aria-label={t(`${m}.editTransition`, { name })}
                  onClick={() => openItem({ kind: 'transition', id: transition.id })}
                  data-testid="machine-transition-open"
                >
                  <bdi>{name}</bdi>
                </button>
                <p className="rulerow__meta">
                  {pairName(transition)} ·{' '}
                  {transition.guardRuleId
                    ? t(`${m}.guard`, {
                        title: ruleTitle.get(transition.guardRuleId) ?? t(`${m}.unknownGuard`),
                      })
                    : t(`${m}.noGuard`)}
                  {marks.has(transition.id) ? (
                    <>
                      {' · '}
                      <GuardMark mark={marks.get(transition.id)!} />
                    </>
                  ) : null}
                </p>
                {rowError(transition.id)}
              </li>
            )
          })}
        </ul>
      ) : null}
      {draft.states.length === 1 ? (
        <QuietNote spacing="hint">{t(`${m}.needTwoStates`)}</QuietNote>
      ) : null}
      <div className="actions form__actions">
        <NewButton
          tone="secondary"
          disabled={draft.states.length < 2 || draft.transitions.length >= MACHINE_MAX_TRANSITIONS}
          onClick={() => setOpen({ kind: 'transition', id: null })}
          data-testid="machine-add-transition"
        >
          {t(`${m}.addTransition`)}
        </NewButton>
      </div>
    </section>
  )
}
