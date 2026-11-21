import type { ReactNode } from 'react'
import { Field } from './Field'
import { isParentSemantic, type FamilySemanticValue } from '../relationships/types'

/**
 * The family meaning of a relation kind, as a select. A kind that reads the same both ways names no parent side, so a
 * symmetric kind is offered only the meanings that define no ancestry, and a parent meaning it still holds shows as
 * `fallback`. Each screen passes its own options and words. Catalogue: docs/design/ui-components.md.
 */
export function FamilySemanticSelect({
  label,
  id,
  testId,
  hint,
  error,
  options,
  value,
  isSymmetric,
  fallback,
  onChange,
}: {
  label: string
  id: string
  testId: string
  hint?: ReactNode
  error?: string
  options: readonly { value: FamilySemanticValue; label: string }[]
  value: FamilySemanticValue
  isSymmetric: boolean
  fallback: FamilySemanticValue
  onChange: (semantic: FamilySemanticValue) => void
}) {
  return (
    <Field
      as="select"
      label={label}
      id={id}
      hint={hint}
      error={error}
      value={isSymmetric && isParentSemantic(value) ? fallback : value}
      onChange={(event) => onChange(Number(event.target.value) as FamilySemanticValue)}
      data-testid={testId}
    >
      {options
        .filter((option) => !isSymmetric || !isParentSemantic(option.value))
        .map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
    </Field>
  )
}
