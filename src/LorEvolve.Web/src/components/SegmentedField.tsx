import type { ComponentProps, ReactNode } from 'react'
import { Field } from './Field'
import { SegmentedControl } from './SegmentedControl'

type ControlProps<T extends string | number | null> = Omit<
  ComponentProps<typeof SegmentedControl<T>>,
  'label' | 'role' | 'aria-labelledby' | 'aria-describedby'
>

/**
 * A choice among a few values as a form field: `Field`'s group form round a `SegmentedControl`,
 * so the label names the group and the hint and error are read with it. A bare toolbar or filter
 * keeps `SegmentedControl` alone. Catalogue: `docs/design/ui-components.md`.
 */
export function SegmentedField<T extends string | number | null>({
  label,
  hint,
  error,
  id,
  className,
  fieldTestId,
  ...control
}: ControlProps<T> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  id?: string
  /** Extra classes on the `.field` wrapper. */
  className?: string
  /** A test id on the `.field` wrapper. */
  fieldTestId?: string
}) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      id={id}
      group
      className={className}
      data-testid={fieldTestId}
    >
      {(group) => <SegmentedControl {...control} {...group} />}
    </Field>
  )
}
