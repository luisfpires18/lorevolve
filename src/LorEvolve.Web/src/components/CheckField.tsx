import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'checked' | 'onChange' | 'className' | 'children' | 'id'
>

/**
 * One yes or no option: a box with its label after it, inside `.field`, with an optional hint and
 * error named by the box (`${id}-hint`, `${id}-error`, as `Field` names them). A list of options
 * is `Field group` round `.choices`. Catalogue: `docs/design/ui-components.md`.
 */
export function CheckField({
  label,
  hint,
  error,
  checked,
  onChange,
  id: given,
  testId,
  className,
  ...input
}: InputProps & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  testId?: string
  /** Extra classes on the `.field` wrapper. */
  className?: string
}) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="check" htmlFor={id}>
        <input
          {...input}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          data-testid={testId}
        />
        {label}
      </label>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
