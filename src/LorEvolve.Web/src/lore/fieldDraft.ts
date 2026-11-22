import type { FieldInput } from './fieldsApi'
import { FieldImageShape, FieldKind, type FieldKindValue } from './fieldKinds'
import type { FieldDefinition } from './typeDefinitions'

export const KIND_ORDER: FieldKindValue[] = [
  FieldKind.ShortText,
  FieldKind.LongText,
  FieldKind.Number,
  FieldKind.Boolean,
  FieldKind.Date,
  FieldKind.Select,
  FieldKind.MultiSelect,
  FieldKind.EntityReference,
  FieldKind.Image,
]

/** A link field's allowed target as one select value. `null` is a new field's "not chosen yet". */
export type TargetChoice = 'any' | `type:${string}` | `group:${string}` | null

export function targetChoice(field: FieldDefinition): TargetChoice {
  if (field.targetGroupId) return `group:${field.targetGroupId}`
  return field.targetEntityTypeId ? `type:${field.targetEntityTypeId}` : 'any'
}

export function parseTarget(
  value: TargetChoice,
): Pick<FieldInput, 'targetEntityTypeId' | 'targetGroupId'> {
  if (value?.startsWith('group:'))
    return { targetEntityTypeId: null, targetGroupId: value.slice(6) }
  if (value?.startsWith('type:')) return { targetEntityTypeId: value.slice(5), targetGroupId: null }
  return { targetEntityTypeId: null, targetGroupId: null }
}

/** A select's options as typed: comma-separated, or one per line where `lines` (a project field, whose options may hold commas). */
export function splitOptions(text: string, lines = false) {
  return text
    .split(lines ? '\n' : ',')
    .map((option) => option.trim())
    .filter(Boolean)
}

/** What the drawer edits, as it reads for a field (or a new one). */
export function draftOf(field: FieldDefinition | null, lines = false) {
  return {
    name: field?.name ?? '',
    kind: field?.kind ?? FieldKind.ShortText,
    isRequired: field?.isRequired ?? false,
    options: field ? field.options.map((option) => option.value).join(lines ? '\n' : ', ') : '',
    semantic: field?.semantic ?? null,
    defaultValue: field?.defaultValue ?? '',
    imageShape: field?.imageShape ?? FieldImageShape.Free,
    target: (field ? targetChoice(field) : null) as TargetChoice,
  }
}
