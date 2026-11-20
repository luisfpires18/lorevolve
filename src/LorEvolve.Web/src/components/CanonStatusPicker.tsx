import { CANON_KEYS, CANON_LABELS, CANON_ORDER, type CanonStatusValue } from '../lore/types'
import type { ReactNode } from 'react'
import { Field } from './Field'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

/**
 * How settled something is, as a choice on the page: Idea, Draft, Canon, each with its glyph, on
 * `SegmentedControl`'s canon look. `allLabel` adds an "any" option first, value `null`, for a
 * filter. `field` draws it as a form field, labelled, with its hint and error. A `<select>` of the same steps keeps `CANON_ORDER` itself. Catalogue:
 * `docs/design/ui-components.md`.
 */
export function CanonStatusPicker<T extends CanonStatusValue | null = CanonStatusValue>({
  value,
  onChange,
  allLabel,
  optionTestId,
  field,
  ...rest
}: {
  value: T
  onChange: (value: T) => void
  /** The "any" option's word; without it there are only the three steps. */
  allLabel?: string
  /** Prefix of each step's test id, before its key (`idea`, `draft`, `canon`). */
  optionTestId?: string
  label?: string
  disabled?: boolean
  testId?: string
  role?: 'group'
  'aria-labelledby'?: string
  'aria-describedby'?: string
  /** Draws the picker inside `Field`'s group form. */
  field?: { label: ReactNode; hint?: ReactNode; error?: ReactNode; id?: string; className?: string }
}) {
  const steps = CANON_ORDER.map((option): SegmentedOption<T> => ({
    value: option as T,
    label: CANON_LABELS[option],
    canon: option,
    testId: optionTestId === undefined ? undefined : `${optionTestId}${CANON_KEYS[option]}`,
  }))
  const options = allLabel === undefined ? steps : [{ value: null as T, label: allLabel }, ...steps]
  const picker = (
    group: Partial<Pick<typeof rest, 'role' | 'aria-labelledby' | 'aria-describedby'>>,
  ) => (
    <SegmentedControl
      {...rest}
      {...group}
      look="canon"
      options={options}
      value={value}
      onChange={onChange}
    />
  )
  if (!field) return picker({})
  return (
    <Field {...field} group>
      {(group) => picker(group)}
    </Field>
  )
}
