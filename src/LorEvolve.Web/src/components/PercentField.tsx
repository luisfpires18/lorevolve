import type { ReactNode } from 'react'
import { Field } from './Field'

export interface PercentAxis {
  label: ReactNode
  /** The number as typed, in percent. */
  value: string
  onChange: (raw: string) => void
  invalid?: boolean
  testId: string
}

/**
 * A position on an image in percent: one fieldset with an across and a down number, each from 0
 * to 100 with a `%` mark. Catalogue: `docs/design/ui-components.md`.
 */
export function PercentField({
  label,
  hint,
  error,
  className,
  across,
  down,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Extra classes on the `.field` wrapper. */
  className?: string
  across: PercentAxis
  down: PercentAxis
}) {
  return (
    <Field
      group="fieldset"
      className={['mappinform__position', className].filter(Boolean).join(' ')}
      label={label}
      hint={hint}
      error={error}
    >
      <div className="mappinform__coords">
        {[across, down].map((axis) => (
          <label className="mappinform__coord" key={axis.testId}>
            <span>{axis.label}</span>
            <input
              className="field__input"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={axis.value}
              onChange={(event) => axis.onChange(event.target.value)}
              aria-invalid={axis.invalid ? true : undefined}
              data-testid={axis.testId}
            />
            <span aria-hidden="true">%</span>
          </label>
        ))}
      </div>
    </Field>
  )
}
