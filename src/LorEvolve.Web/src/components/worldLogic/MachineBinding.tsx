import type { ReactNode } from 'react'
import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import { m } from '../../worldLogic/machinePanelTypes'

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
      <h2 className="sectionrule">{t(`${m}.binding`)}</h2>
      <ul className="rulelist">
        <li className="rulerow" data-testid="machine-binding-row">
          <button
            className="rulerow__title rulerow__toggle"
            type="button"
            aria-label={t(`${m}.editBinding`)}
            onClick={() => setOpen({ kind: 'binding' })}
            data-testid="machine-binding-open"
          >
            {t(`${m}.binding`)}
          </button>
          <p className="rulerow__meta" dir="auto">
            {hasBinding ? t(`${m}.bindingSet`, { subjectType, attribute }) : t(`${m}.bindingUnset`)}
          </p>
          {rowError('binding')}
        </li>
      </ul>
    </section>
  )
}
