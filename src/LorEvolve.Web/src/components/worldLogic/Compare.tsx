import type { Json, JsonObject } from '../../worldLogic/guard'
import { compareOperators, fixOperator } from '../../worldLogic/guardBlocks'
import { tg, select } from '../../worldLogic/guardBuilderKeys'
import { Operand } from './Operand'

export function Compare({ node, onChange }: { node: JsonObject; onChange: (next: Json) => void }) {
  const operators = compareOperators(node.left, node.right)
  const op = String(node.op)
  // An operator written elsewhere is offered as it is, so opening a guard never changes it.
  const shown = operators.includes(op as never) ? operators : [...operators, op]
  const side = (name: 'left' | 'right') => (next: Json) =>
    onChange(fixOperator({ ...node, [name]: next }))

  return (
    <>
      <Operand value={node.left} side="left" onChange={side('left')} />
      <div className="guardblock__row">
        <select
          className={select}
          value={op}
          aria-label={tg('operator')}
          onChange={(event) => onChange({ ...node, op: event.target.value })}
          data-testid="guard-op"
        >
          {shown.map((each) => (
            <option key={each} value={each}>
              {tg(`ops.${each}`)}
            </option>
          ))}
        </select>
      </div>
      <Operand value={node.right} side="right" onChange={side('right')} />
    </>
  )
}
