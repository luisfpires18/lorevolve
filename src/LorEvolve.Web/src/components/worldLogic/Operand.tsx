import {
  isObject,
  LITERAL_TYPES,
  OPERAND_KINDS,
  type Json,
  type JsonObject,
  type LiteralType,
  type NewOperandKind,
} from '../../worldLogic/guard'
import { newLiteral, newOperand } from '../../worldLogic/guardBlocks'
import { classifyOperand } from '../../worldLogic/guardClassify'
import { tg, select, type Side } from '../../worldLogic/guardBuilderKeys'
import { TypedValue } from './TypedValue'
import { Query } from './Query'

/** One side of a comparison or a relation: what kind of thing it is, then that thing's own controls. */
export function Operand({
  value,
  side,
  onChange,
  labelled = false,
}: {
  value: Json | undefined
  side: Side
  onChange: (next: Json) => void
  labelled?: boolean
}) {
  const kind = classifyOperand(value) ?? 'kept'
  const operand = isObject(value) ? value : {}
  const name = tg(`sides.${side}`)
  const kinds: string[] = kind === 'kept' ? [...OPERAND_KINDS, 'kept'] : OPERAND_KINDS

  return (
    <div className="guardblock__slot" data-testid="guard-operand" data-side={side}>
      <div className="guardblock__row">
        {labelled ? <span className="guardblock__kind">{name}</span> : null}
        <select
          className={select}
          value={kind}
          aria-label={tg('slot.kind', { side: name })}
          onChange={(event) => onChange(newOperand(event.target.value as NewOperandKind))}
          data-testid="guard-operand-kind"
        >
          {kinds.map((each) => (
            <option key={each} value={each} disabled={each === 'kept'}>
              {tg(`operandKinds.${each}`)}
            </option>
          ))}
        </select>
        {kind === 'attribute' ? (
          <input
            className="field__input"
            type="text"
            dir="auto"
            value={String(operand.attribute)}
            placeholder={tg('placeholders.attribute')}
            aria-label={tg('slot.attribute', { side: name })}
            onChange={(event) => onChange({ ...operand, attribute: event.target.value })}
            data-testid="guard-attribute"
          />
        ) : null}
        {kind === 'literal' ? (
          <>
            <select
              className={select}
              value={String(operand.type)}
              aria-label={tg('slot.type', { side: name })}
              onChange={(event) =>
                onChange({ ...operand, ...newLiteral(event.target.value as LiteralType) })
              }
              data-testid="guard-literal-type"
            >
              {LITERAL_TYPES.map((each) => (
                <option key={each} value={each}>
                  {tg(`types.${each}`)}
                </option>
              ))}
            </select>
            <TypedValue
              type={operand.type as LiteralType}
              value={operand.literal}
              name={name}
              onChange={(literal) => onChange({ ...operand, literal })}
              testId="guard-literal"
            />
          </>
        ) : null}
      </div>
      {kind === 'count' ? (
        <Query
          query={operand.count as JsonObject}
          onChange={(count) => onChange({ ...operand, count })}
        />
      ) : null}
    </div>
  )
}
