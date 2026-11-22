import type { ReactNode } from 'react'
import { GuardMark, MachineGroup } from '../SystemMachineTry'
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
import { LinkRow, RuleList } from '../LinkRow'

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
    <MachineGroup
      title={t(`${m}.transitions`)}
      add={
        <NewButton
          tone="secondary"
          disabled={draft.states.length < 2 || draft.transitions.length >= MACHINE_MAX_TRANSITIONS}
          onClick={() => setOpen({ kind: 'transition', id: null })}
          data-testid="machine-add-transition"
        >
          {t(`${m}.addTransition`)}
        </NewButton>
      }
    >
      {draft.transitions.length > 0 ? (
        <RuleList testId="machine-transition-rows">
          {draft.transitions.map((transition) => {
            const name = transition.label.trim() || pairName(transition)
            return (
              <LinkRow
                look="rule"
                key={transition.id}
                testId="machine-transition-row"
                data-transition-id={transition.id}
                title={name}
                titleTestId="machine-transition-open"
                openLabel={t(`${m}.editTransition`, { name })}
                onOpen={() => openItem({ kind: 'transition', id: transition.id })}
                meta={
                  <>
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
                  </>
                }
                aside={rowError(transition.id)}
              />
            )
          })}
        </RuleList>
      ) : null}
      {draft.states.length === 1 ? (
        <QuietNote spacing="hint">{t(`${m}.needTwoStates`)}</QuietNote>
      ) : null}
    </MachineGroup>
  )
}
