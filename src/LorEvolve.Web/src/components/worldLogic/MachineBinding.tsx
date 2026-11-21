import type { ReactNode } from 'react'
import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import { m } from '../../worldLogic/machinePanelTypes'
import { SectionTitle } from '../Section'
import { LinkRow } from '../LinkRow'

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
    <section className="machinepanel__group">
      <SectionTitle tone="rule">{t(`${m}.binding`)}</SectionTitle>
      <ul className="rulelist">
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
      </ul>
    </section>
  )
}
