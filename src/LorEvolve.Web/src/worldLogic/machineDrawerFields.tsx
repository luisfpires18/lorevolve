import type { ReactNode } from 'react'
import { MACHINE_TEXT_MAX_LENGTH } from './types'

/** The message a field shows: the drawer's own check first, then what the last refused save said about it. */
export function errorOf(
  local: Record<string, string>,
  saved: Record<string, string> | undefined,
  prop: string,
) {
  return local[prop] ?? saved?.[prop]
}

export function textInput(
  value: string,
  onChange: (next: string) => void,
  placeholder: string,
  testId: string,
  required = false,
) {
  return (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }): ReactNode => (
    <input
      id={control.id}
      className="field__input"
      type="text"
      dir="auto"
      value={value}
      maxLength={MACHINE_TEXT_MAX_LENGTH}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={control['aria-invalid']}
      aria-describedby={control['aria-describedby']}
      aria-required={required || undefined}
      data-testid={testId}
    />
  )
}
