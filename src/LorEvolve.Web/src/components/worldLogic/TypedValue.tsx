import { TIME_SCOPES } from '../../worldLogic/conditionSchema'
import { pointValueOf, scopeOf, type Json, type LiteralType } from '../../worldLogic/guard'
import { tg, select } from '../../worldLogic/guardBuilderKeys'
import { NumberInput } from './NumberInput'

/** A value of one literal type: yes or no, a number, text, or a time point's scope and value. */
export function TypedValue({
  type,
  value,
  name,
  onChange,
  testId,
}: {
  type: LiteralType
  value: Json | undefined
  name: string
  onChange: (next: Json) => void
  testId: string
}) {
  if (type === 'boolean') {
    return (
      <select
        className={select}
        value={value === false ? 'false' : 'true'}
        aria-label={tg('slot.value', { side: name })}
        onChange={(event) => onChange(event.target.value === 'true')}
        data-testid={`${testId}-boolean`}
      >
        <option value="true">{tg('yes')}</option>
        <option value="false">{tg('no')}</option>
      </select>
    )
  }
  if (type === 'number') {
    return <NumberInput value={value} name={name} onChange={onChange} testId={`${testId}-value`} />
  }
  if (type === 'timePoint') {
    const point = typeof value === 'string' ? value : ''
    const scope = scopeOf(point) || TIME_SCOPES[0]
    return (
      <>
        <select
          className={select}
          value={scope}
          aria-label={tg('slot.scope', { side: name })}
          onChange={(event) => onChange(`${event.target.value}:${pointValueOf(point)}`)}
          data-testid={`${testId}-scope`}
        >
          {TIME_SCOPES.map((each) => (
            <option key={each} value={each}>
              {tg(`scopes.${each}`)}
            </option>
          ))}
        </select>
        <input
          className="field__input"
          type="text"
          dir="auto"
          value={pointValueOf(point)}
          placeholder={tg('placeholders.value')}
          aria-label={tg('slot.value', { side: name })}
          onChange={(event) => onChange(`${scope}:${event.target.value}`)}
          data-testid={`${testId}-value`}
        />
      </>
    )
  }
  return (
    <input
      className="field__input"
      type="text"
      dir="auto"
      value={typeof value === 'string' ? value : ''}
      placeholder={tg('placeholders.value')}
      aria-label={tg('slot.value', { side: name })}
      onChange={(event) => onChange(event.target.value)}
      data-testid={`${testId}-value`}
    />
  )
}
