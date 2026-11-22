import type { ReactNode } from 'react'
import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import { m } from '../../worldLogic/machinePanelTypes'
import { MachineGroup } from '../SystemMachineTry'
import { LinkRow, RuleList } from '../LinkRow'

type State = ReturnType<typeof useMachinePanelState>

/** The machine panel's binding group: the one row that opens the binding. */
export function MachineBinding({
  setOpen,
  hasBinding,
  subjectType,
  attribute,
  rowError,
}: Pick<State, 'setOpen'> & {
  hasBinding: boolean
  subjectType: string
  attribute: string
  rowError: (item: string) => ReactNode
}) {
  return (
    <MachineGroup title={t(`${m}.binding`)}>
      <RuleList>
        <LinkRow
          look="rule"
          testId="machine-binding-row"
          title={t(`${m}.binding`)}
          isolate={false}
          titleTestId="machine-binding-open"
          openLabel={t(`${m}.editBinding`)}
          onOpen={() => setOpen({ kind: 'binding' })}
          metaDirAuto
          meta={
            hasBinding ? t(`${m}.bindingSet`, { subjectType, attribute }) : t(`${m}.bindingUnset`)
          }
          aside={rowError('binding')}
        />
      </RuleList>
    </MachineGroup>
  )
}
