import { useState } from 'react'
import { TIME_SCOPES } from '../../worldLogic/conditionSchema'
import { pointValueOf, scopeOf, type Json, type LiteralType } from '../../worldLogic/guard'
import { tg, select } from '../../worldLogic/guardBuilderKeys'

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

/**
 * A number typed as text: a value that reads as a number is stored as one, anything else is kept as the text so the
 * author sees what they typed, and the save is held until it is a number.
 */
function NumberInput({
  value,
  name,
  onChange,
  testId,
}: {
  value: Json | undefined
  name: string
  onChange: (next: Json) => void
  testId: string
}) {
  const [text, setText] = useState(String(value ?? ''))
  // The typed text while it still reads as the stored number ("1." is 1), else the stored value itself.
  const shown =
    typeof value === 'string'
      ? value
      : text.trim() !== '' && Number(text) === value
        ? text
        : String(value ?? '')

  return (
    <input
      className="field__input"
      type="text"
      inputMode="decimal"
      value={shown}
      placeholder={tg('placeholders.number')}
      aria-label={tg('slot.value', { side: name })}
      onChange={(event) => {
        const next = event.target.value
        const number = Number(next)
        setText(next)
        onChange(next.trim() !== '' && Number.isFinite(number) ? number : next)
      }}
      data-testid={testId}
    />
  )
}
