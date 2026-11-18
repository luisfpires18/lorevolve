import { useState } from 'react'
import type { Json } from '../../worldLogic/guard'
import { tg } from '../../worldLogic/guardBuilderKeys'

/**
 * A number typed as text: a value that reads as a number is stored as one, anything else is kept as the text so the
 * author sees what they typed, and the save is held until it is a number.
 */
export function NumberInput({
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
