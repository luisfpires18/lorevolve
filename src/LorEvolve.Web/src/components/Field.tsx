import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface FieldBase {
  label: string
  /** Read with the control, drawn between the label and the control. */
  hint?: ReactNode
  /** Drawn under the control and named by it. */
  error?: ReactNode
  /** Extra classes on the `div.field`. */
  className?: string
}

/** Input form: `id` is `name`, everything else goes on the `<input>`. */
type InputField = FieldBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'children'> & {
    name: string
    children?: undefined
  }

/** Slot form: any labelable control (select, textarea, a custom control). */
interface SlotField extends FieldBase {
  id?: string
  'data-testid'?: string
  group?: false
  children: (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }) => ReactNode
}

/** Group form: buttons or a set of checkboxes, joined to the label by aria-labelledby. */
interface GroupField extends FieldBase {
  id?: string
  'data-testid'?: string
  group: true
  children: (control: {
    role: 'group'
    'aria-labelledby': string
    'aria-describedby'?: string
  }) => ReactNode
}

type FieldProps = InputField | SlotField | GroupField

/** A field: label, hint, control, error, in that order. Overloads give each form its own `children` type. */
export function Field(props: InputField): ReactNode
export function Field(props: SlotField): ReactNode
export function Field(props: GroupField): ReactNode
export function Field(props: FieldProps) {
  const auto = useId()
  const { label, hint, error } = props
  const id = props.children === undefined ? props.name : (props.id ?? auto)
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const labelId = `${id}-label`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  let control: ReactNode
  let testId: string | undefined
  let labelNode: ReactNode
  if (props.children === undefined) {
    const { label: _l, hint: _h, error: _e, className: _c, children: _k, ...input } = props
    labelNode = (
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
    )
    control = (
      <input
        {...input}
        id={id}
        name={props.name}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
    )
  } else if (props.group) {
    testId = props['data-testid']
    labelNode = (
      <div className="field__label" id={labelId}>
        {label}
      </div>
    )
    control = props.children({
      role: 'group',
      'aria-labelledby': labelId,
      'aria-describedby': describedBy || undefined,
    })
  } else {
    testId = props['data-testid']
    labelNode = (
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
    )
    control = props.children({
      id,
      'aria-describedby': describedBy || undefined,
      'aria-invalid': error ? true : undefined,
    })
  }

  return (
    <div className={props.className ? `field ${props.className}` : 'field'} data-testid={testId}>
      {labelNode}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
