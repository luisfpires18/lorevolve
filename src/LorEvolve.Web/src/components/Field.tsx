import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useI18n } from '../i18n'
import { CharCount, countShows, type CharCountProps } from './CharCount'

interface FieldBase {
  label: ReactNode
  /** Read with the control, drawn between the label and the control. */
  hint?: ReactNode
  /** Drawn under the control and named by it. */
  error?: ReactNode
  /** The error is drawn above the control, after the hint: for words that point at what follows ("below"). */
  errorAbove?: boolean
  /** Drawn after the error, inside the field: a tool that belongs to the field but not between the control and its refusal. */
  after?: ReactNode
  /** Extra classes on the `.field` wrapper. */
  className?: string
  /** The label stays for screen readers and is not drawn. */
  hideLabel?: boolean
  /** Draws " (required)" after the label; native `required` is a separate prop. */
  requiredMark?: boolean
  /** The error paragraph is read out as it appears. */
  announce?: boolean
  /** A test id on the error paragraph. */
  errorTestId?: string
}

/** A character count under the control; its id is the field's id plus `-count`. */
type FieldCount = Omit<CharCountProps, 'id'>

/** Input form: `id` is `name`, everything else goes on the `<input>`. */
type InputField = FieldBase &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'children'> & {
    name: string
    as?: undefined
    count?: FieldCount
    children?: undefined
  }

/** Textarea form: `id` is `name ?? id`, everything else goes on the `<textarea>`. */
type TextareaField = FieldBase &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'children'> & {
    as: 'textarea'
    ref?: Ref<HTMLTextAreaElement>
    controlClassName?: string
    count?: FieldCount
    children?: undefined
  }

/** Select form: `id` is `name ?? id`, `children` are its options. */
type SelectField = FieldBase &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
    as: 'select'
    ref?: Ref<HTMLSelectElement>
    controlClassName?: string
    count?: undefined
    children: ReactNode
  }

/** Slot form: any labelable control (a custom control). */
interface SlotField extends FieldBase {
  id?: string
  as?: undefined
  'data-testid'?: string
  group?: false
  count?: FieldCount
  children: (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }) => ReactNode
}

/** Group form: buttons or a set of checkboxes, joined to the label by aria-labelledby. */
interface GroupField extends FieldBase {
  id?: string
  as?: undefined
  'data-testid'?: string
  group: true
  count?: undefined
  children: (control: {
    role: 'group'
    'aria-labelledby': string
    'aria-describedby'?: string
  }) => ReactNode
}

/** Fieldset form: a set of controls under a native legend; keeps the fieldset's group name and `disabled`. */
interface FieldsetField extends FieldBase {
  id?: string
  as?: undefined
  'data-testid'?: string
  group: 'fieldset'
  disabled?: boolean
  count?: undefined
  children: ReactNode
}

type FieldProps = InputField | TextareaField | SelectField | SlotField | GroupField | FieldsetField

/** A field: label, hint, control, count, error, in that order. Overloads give each form its own `children` type. */
export function Field(props: InputField): ReactNode
export function Field(props: TextareaField): ReactNode
export function Field(props: SelectField): ReactNode
export function Field(props: SlotField): ReactNode
export function Field(props: GroupField): ReactNode
export function Field(props: FieldsetField): ReactNode
export function Field(props: FieldProps) {
  const auto = useId()
  const { t } = useI18n()
  const { label, hint, error, count } = props
  const id =
    'name' in props && props.name ? props.name : 'id' in props && props.id ? props.id : auto
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const labelId = `${id}-label`
  const countId = `${id}-count`
  const labelClass = props.hideLabel ? 'field__label visually-hidden' : 'field__label'
  const showsCount = count ? countShows(count) : false
  const overCount = count ? count.used > count.max : false
  const describedBy = [hint ? hintId : null, showsCount ? countId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')
  const invalid = error || overCount ? true : undefined
  const labelText = props.requiredMark ? (
    <>
      {label} {t('shell.fields.required')}
    </>
  ) : (
    label
  )
  const forLabel = (
    <label className={labelClass} htmlFor={id}>
      {labelText}
    </label>
  )

  let control: ReactNode
  let testId: string | undefined
  let labelNode: ReactNode = forLabel
  let Wrapper: 'div' | 'fieldset' = 'div'
  let disabled: boolean | undefined
  if (props.as === 'textarea' || props.as === 'select' || 'name' in props) {
    const {
      label: _l,
      hint: _h,
      error: _e,
      errorAbove: _b,
      after: _f,
      className: _c,
      hideLabel: _x,
      requiredMark: _r,
      announce: _a,
      errorTestId: _t,
      count: _n,
      as: kind,
      controlClassName,
      ...rest
    } = props as TextareaField & { controlClassName?: string }
    const own = (rest as { 'aria-describedby'?: string })['aria-describedby']
    const shared = {
      id,
      'aria-invalid': (rest as { 'aria-invalid'?: boolean })['aria-invalid'] ?? invalid,
      'aria-describedby': [describedBy, own].filter(Boolean).join(' ') || undefined,
    }
    if (kind === 'textarea') {
      control = (
        <textarea
          {...rest}
          {...shared}
          className={['field__input field__input--area', controlClassName]
            .filter(Boolean)
            .join(' ')}
        />
      )
    } else if (kind === 'select') {
      control = (
        <select
          {...(rest as SelectHTMLAttributes<HTMLSelectElement>)}
          {...shared}
          className={['field__input field__input--select', controlClassName]
            .filter(Boolean)
            .join(' ')}
        />
      )
    } else {
      const { children: _k, ...input } = rest as InputField
      control = <input {...input} {...shared} name={id} className="field__input" />
    }
  } else if (props.group === 'fieldset') {
    testId = props['data-testid']
    Wrapper = 'fieldset'
    disabled = props.disabled
    labelNode = <legend className={labelClass}>{labelText}</legend>
    control = props.children
  } else if (props.group) {
    testId = props['data-testid']
    labelNode = (
      <div className={labelClass} id={labelId}>
        {labelText}
      </div>
    )
    control = props.children({
      role: 'group',
      'aria-labelledby': labelId,
      'aria-describedby': describedBy || undefined,
    })
  } else {
    testId = props['data-testid']
    control = props.children({
      id,
      'aria-describedby': describedBy || undefined,
      'aria-invalid': invalid,
    })
  }

  const errorNode = error ? (
    <p
      className="field__error"
      id={errorId}
      role={props.announce ? 'alert' : undefined}
      data-testid={props.errorTestId}
    >
      {error}
    </p>
  ) : null

  return (
    <Wrapper
      className={props.className ? `field ${props.className}` : 'field'}
      data-testid={testId}
      disabled={disabled}
      aria-describedby={Wrapper === 'fieldset' ? describedBy || undefined : undefined}
    >
      {labelNode}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {props.errorAbove ? errorNode : null}
      {control}
      {count ? <CharCount {...count} id={countId} /> : null}
      {props.errorAbove ? null : errorNode}
      {props.after}
    </Wrapper>
  )
}
