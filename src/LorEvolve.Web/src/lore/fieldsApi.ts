import { apiFetch } from '../lib/api'

import type { EntityType } from './typeDefinitions'
import type { FieldImageShapeValue, FieldKindValue, FieldSemanticValue } from './fieldKinds'

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

export interface FieldInput {
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number | null
  defaultValue: string | null
  options: string[] | null

  /** Null unless the author declares a meaning. Never guessed from the name - ADR 0011. */
  semantic: FieldSemanticValue | null

  /**
   * A link field's one allowed type, or null for any Lore type; null for every other kind. Required here, so an edit that
   * only means to change something else sends the field's own limit back rather than clearing it.
   */
  targetEntityTypeId: string | null

  /** A link field's group instead of a type, or null. Required for the same reason. Never sent beside a type. */
  targetGroupId: string | null

  /** An Image field's crop shape; null for every other kind. */
  imageShape?: FieldImageShapeValue | null

  /**
   * The field's version this edit was made over (ADR 0043). Required by an edit, which is refused (409, `FIELD_CHANGED_CODE`)
   * when it is no longer current; ignored when adding a field.
   */
  expectedVersion?: number
}

export function addField(universeId: string, typeId: string, input: FieldInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}/fields`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Replaces one field definition. Gated by the promotion gate on the API, because declaring
 * a meaning on a field that already holds values can introduce a High finding all at once.
 */
export function updateField(
  universeId: string,
  typeId: string,
  fieldId: string,
  input: FieldInput,
) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}/fields/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * Deletes a field for good. Refused (409, `FIELD_IN_USE_CODE`) while any entry, the Trash included, holds a value for it:
 * a populated field is archived instead.
 */
export function deleteField(universeId: string, typeId: string, fieldId: string) {
  return apiFetch<void>(`${base(universeId)}/entity-types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE',
  })
}

/** The code on the 409 for deleting a field that holds values. */
export const FIELD_IN_USE_CODE = 'entity_field_in_use'

/** The code on the 409 for a field edit made over a version that is no longer current. */
export const FIELD_CHANGED_CODE = 'entity_field_changed'

/** The code on the 409 for a field layout saved over sections someone changed since (Issue #26). */
export const FIELD_LAYOUT_CHANGED_CODE = 'entity_field_layout_changed'

/** One section of a layout save: one of the type's own by `id`, or a new one (no `id`); its fields as a set. */
export interface FieldSectionInput {
  id: string | null
  name: string
  startsCollapsed: boolean
  fieldIds: string[]
}

/**
 * Saves a type's whole field layout (Issue #26): its sections in order, which field sits in which, and the fields' order -
 * `ungroupedFieldIds` first, then each section's `fieldIds`, as listed. A section left out is removed and its fields become
 * ungrouped, as does any field no section lists. Changes no field's settings, values or version. Answers the type.
 */
export function saveFieldLayout(
  universeId: string,
  typeId: string,
  sections: FieldSectionInput[],
  ungroupedFieldIds: string[],
  expectedVersion: number,
) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}/field-layout`, {
    method: 'PUT',
    body: JSON.stringify({ sections, ungroupedFieldIds, expectedVersion }),
  })
}

/** The code on the 409 for making a field required, or restoring it required, while live entries have no value for it. */
export const FIELD_REQUIRED_MISSING_CODE = 'entity_field_required_missing'

/**
 * Archives a field: it leaves every form, read and filter, and keeps its definition and every value until it is restored.
 * Answers the type as it is now.
 */
export function archiveField(universeId: string, typeId: string, fieldId: string) {
  return apiFetch<EntityType>(
    `${base(universeId)}/entity-types/${typeId}/fields/${fieldId}/archive`,
    {
      method: 'POST',
    },
  )
}

/**
 * Restores an archived field with everything it kept. A required field that live entries have no value for is refused
 * (409, `FIELD_REQUIRED_MISSING_CODE`) unless `asOptional` says, explicitly, to bring it back optional.
 */
export function restoreField(
  universeId: string,
  typeId: string,
  fieldId: string,
  asOptional = false,
) {
  return apiFetch<EntityType>(
    `${base(universeId)}/entity-types/${typeId}/fields/${fieldId}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ asOptional }),
    },
  )
}
