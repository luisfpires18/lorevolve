import type { FieldImageRef } from '../lore/types'
// The .ts extension lets `node --test` load this file on its own (fieldRows.test.ts).
import {
  FieldKind,
  type FieldValue,
  type FieldValueInput,
  type ProjectEntityDetail,
  type ProjectEntityType,
  type ProjectField,
} from './types.ts'

export type FieldRow = {
  id: string
  name: string
  kind: number
  value: FieldValue | null
  image: FieldImageRef | null
}

/**
 * An entry's fields in its own type's order (#287), empty ones included, since the read carries only stored values. No
 * type (its read failed) leaves the stored values in the order the API sent them.
 */
export function fieldRows(type: ProjectEntityType | null, detail: ProjectEntityDetail): FieldRow[] {
  const image = (id: string) => detail.fieldImages.find((one) => one.fieldId === id) ?? null
  if (type === null) {
    return detail.fields.map((value) => ({
      id: value.fieldDefinitionId,
      name: value.name,
      kind: value.kind,
      value,
      image: null,
    }))
  }
  return [...type.fields, ...type.inheritedFields].map((field) => ({
    id: field.id,
    name: field.name,
    kind: field.kind,
    value: detail.fields.find((one) => one.fieldDefinitionId === field.id) ?? null,
    image: field.kind === FieldKind.Image ? image(field.id) : null,
  }))
}

/** The form's starting values for an edit: each stored value copied across, pictures left to their own control. */
export function valuesFromDetail(
  detail: ProjectEntityDetail,
  fields: readonly ProjectField[],
): Record<string, FieldValueInput> {
  const values: Record<string, FieldValueInput> = {}
  for (const field of fields) {
    if (field.kind === FieldKind.Image) continue
    const stored = detail.fields.find((one) => one.fieldDefinitionId === field.id)
    if (!stored) continue
    values[field.id] = {
      fieldDefinitionId: field.id,
      text: stored.text,
      number: stored.number,
      boolean: stored.boolean,
      date: stored.date,
      optionIds: stored.optionIds.length > 0 ? stored.optionIds : null,
      referencedEntityId: stored.referencedEntityId,
      eraId: stored.eraId,
    }
  }
  return values
}
