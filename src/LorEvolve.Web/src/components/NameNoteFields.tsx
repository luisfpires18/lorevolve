import type { RefObject } from 'react'
import { Field } from './Field'

/**
 * A name box and a note box under it: the pair a drawer opens with. Ids are `${idPrefix}-name` and
 * `${idPrefix}-description`; the name box writes no form name and takes the drawer's first focus through `nameRef`.
 */
export function NameNoteFields({
  idPrefix,
  labels,
  placeholder,
  hint,
  rows = 4,
  maxLength,
  value,
  onChange,
  errors,
  testIds,
  nameRef,
}: {
  idPrefix: string
  labels: { name: string; note: string }
  /** The name box's placeholder. */
  placeholder?: string
  /** The note box's hint. */
  hint?: string
  rows?: number
  /** The note box's limit. */
  maxLength?: number
  value: { name: string; note: string }
  onChange: (part: 'name' | 'note', value: string) => void
  errors: { name?: string; note?: string }
  testIds: { name: string; note: string }
  nameRef?: RefObject<HTMLInputElement | null>
}) {
  return (
    <>
      <Field
        id={`${idPrefix}-name`}
        label={labels.name}
        error={errors.name}
        name={null}
        ref={nameRef}
        dir="auto"
        placeholder={placeholder}
        value={value.name}
        onChange={(event) => onChange('name', event.target.value)}
        data-testid={testIds.name}
      />

      <Field
        as="textarea"
        id={`${idPrefix}-description`}
        label={labels.note}
        hint={hint}
        error={errors.note}
        rows={rows}
        dir="auto"
        maxLength={maxLength}
        value={value.note}
        onChange={(event) => onChange('note', event.target.value)}
        data-testid={testIds.note}
      />
    </>
  )
}
