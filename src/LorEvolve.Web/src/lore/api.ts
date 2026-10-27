import { FIELD_FILTER_PARAM, encodeFieldFilter } from './fieldFilters'
import { apiFetch } from '../lib/api'
import type {
  BulkCreatedEntity,
  BulkEntityRow,
  EntityDetail,
  EntityInput,
  EntityPage,
  EntityQuery,
  EntityType,
  EntityTypeGroup,
  FieldKindValue,
  FieldSemanticValue,
  TagSummary,
} from './types'

export const ENTITY_PAGE_SIZE = 12

/**
 * What the Lore browser offers as entries per page. Bounded on purpose - a world may hold thousands of entries, so there is
 * no "all" - and all within the API's own ceiling of 50, so no request is ever clamped behind the author's back.
 */
export const LORE_PAGE_SIZES = [12, 16, 20, 30, 40] as const

const PAGE_SIZE_KEY = 'lorevolve-lore-page-size'

/** The author's choice in this browser, or the default: a browsing preference, not an account setting. */
export function readLorePageSize(): number {
  try {
    // The key before the rename to LorEvolve (ADR 0067) is read while the new one is unset.
    const stored = Number(
      localStorage.getItem(PAGE_SIZE_KEY) ?? localStorage.getItem('lorex-lore-page-size'),
    )
    return (LORE_PAGE_SIZES as readonly number[]).includes(stored) ? stored : ENTITY_PAGE_SIZE
  } catch {
    return ENTITY_PAGE_SIZE
  }
}

export function saveLorePageSize(size: number) {
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
  } catch {
    // Private windows and blocked storage: the choice holds for this visit.
  }
}

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

// ---------- Entity types ----------

export function listEntityTypes(universeId: string, signal?: AbortSignal) {
  return apiFetch<EntityType[]>(`${base(universeId)}/entity-types`, { signal })
}

export interface EntityTypeInput {
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  displayOrder: number | null
  /** Left out keeps what is stored; a new type without it is not eligible. */
  familyTreeEligible?: boolean
  /**
   * Where the type sits: `{ id }` beneath that type, `{ id: null }` at the root. Left out keeps the stored parent, so a save
   * that is not about the hierarchy cannot move a type.
   */
  parent?: { id: string | null }
  /**
   * The type's whole set of semantic groups, saved with it: an existing group by `{ id }`, a new one by `{ name }`, created
   * only if the save succeeds. Left out keeps the stored groups.
   */
  groups?: ({ id: string } | { name: string })[]
}

export function listEntityTypeGroups(universeId: string, signal?: AbortSignal) {
  return apiFetch<EntityTypeGroup[]>(`${base(universeId)}/entity-type-groups`, { signal })
}

/** Renames a group. Its id, members and every field that links to it are unchanged. */
export function renameEntityTypeGroup(universeId: string, groupId: string, name: string) {
  return apiFetch<EntityTypeGroup>(`${base(universeId)}/entity-type-groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

/**
 * Enables a group for the Family Tree, or turns that off (Issue #37). Only that changes: no type's own switch, no
 * membership and no relationship.
 */
export function setEntityTypeGroupFamilyTree(
  universeId: string,
  groupId: string,
  enabled: boolean,
) {
  return apiFetch<EntityTypeGroup>(
    `${base(universeId)}/entity-type-groups/${groupId}/family-tree`,
    {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    },
  )
}

/** The code on the 409 for deleting a group a link field is limited to. */
export const GROUP_TARGETED = 'entity_type_group_targeted'

/** The code on the 409 for taking a type out of a group that existing links rely on. */
export const GROUP_IN_USE = 'entity_type_group_in_use'

/** Deletes a group and its memberships. The types, fields and entries stay. Refused (409) while a field is limited to it. */
export function deleteEntityTypeGroup(universeId: string, groupId: string) {
  return apiFetch<void>(`${base(universeId)}/entity-type-groups/${groupId}`, { method: 'DELETE' })
}

export function createEntityType(universeId: string, input: EntityTypeInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateEntityType(universeId: string, typeId: string, input: EntityTypeInput) {
  return apiFetch<EntityType>(`${base(universeId)}/entity-types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * One place up or down among the type's direct siblings. Answers the whole list, in order. Up on the first and down on the
 * last change nothing and answer the list as it is.
 */
export function moveEntityType(universeId: string, typeId: string, direction: 'up' | 'down') {
  return apiFetch<EntityType[]>(`${base(universeId)}/entity-types/${typeId}/move`, {
    method: 'POST',
    body: JSON.stringify({ direction }),
  })
}

/**
 * Puts a type at `index` (0-based) among its siblings in one request - a whole drag, however far. `parentId` is the parent
 * this screen showed it under; the API refuses (409) if that is no longer so, rather than reorder a group nobody saw.
 */
export function reorderEntityType(
  universeId: string,
  typeId: string,
  index: number,
  parentId: string | null,
) {
  return apiFetch<EntityType[]>(`${base(universeId)}/entity-types/${typeId}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ index, parentId }),
  })
}

export function deleteEntityType(universeId: string, typeId: string) {
  return apiFetch<void>(`${base(universeId)}/entity-types/${typeId}`, { method: 'DELETE' })
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

// ---------- Entities ----------

export function listEntities(universeId: string, query: EntityQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize ?? ENTITY_PAGE_SIZE),
  })
  if (query.search.trim()) params.set('search', query.search.trim())
  if (query.entityTypeId) params.set('entityTypeId', query.entityTypeId)
  if (query.entityTypeId && query.includeDescendants) params.set('includeDescendants', 'true')
  if (query.entityTypeGroupId) params.set('entityTypeGroupId', query.entityTypeGroupId)
  if (query.canonStatus !== null) params.set('canonStatus', String(query.canonStatus))
  if (query.tag) params.set('tag', query.tag)
  if (query.familyTreeEligible) params.set('familyTreeEligible', 'true')
  if (query.entityTypeId) {
    for (const filter of query.fieldFilters ?? []) {
      params.append(FIELD_FILTER_PARAM, encodeFieldFilter(filter))
    }
  }

  return apiFetch<EntityPage>(`${base(universeId)}/entities?${params.toString()}`, { signal })
}

export function getEntity(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities/${entityId}`, { signal })
}

export function createEntity(universeId: string, input: EntityInput) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Mass create: every row or none. A refused batch answers 400 with its problems keyed by row (`entries[3].name`), or
 * the promotion gate's 409; either way nothing was written.
 */
export function bulkCreateEntities(universeId: string, entries: BulkEntityRow[]) {
  return apiFetch<{ created: BulkCreatedEntity[] }>(`${base(universeId)}/entities/bulk`, {
    method: 'POST',
    body: JSON.stringify({ entries }),
  })
}

/** The code on the 409 an entry save or restore gets when the entry was saved somewhere else after it was opened (ADR 0043). */
export const ENTRY_CHANGED = 'entity_changed'

/** Saves the entry's structured lore over the version `input.expectedVersion` names, if that is still the latest. */
export function updateEntity(universeId: string, entityId: string, input: EntityInput) {
  return apiFetch<EntityDetail>(`${base(universeId)}/entities/${entityId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * Moves these entries to the Trash, every one or none: the same move one entry's Move to Trash makes, for each. A refusal
 * (400, keyed `entityIds[3]`) or a failure writes nothing.
 */
export function bulkTrashEntities(universeId: string, entityIds: string[]) {
  return apiFetch<{ trashed: number }>(`${base(universeId)}/entities/bulk-trash`, {
    method: 'POST',
    body: JSON.stringify({ entityIds }),
  })
}

export function deleteEntity(universeId: string, entityId: string) {
  return apiFetch<void>(`${base(universeId)}/entities/${entityId}`, { method: 'DELETE' })
}

export function listTags(universeId: string, signal?: AbortSignal) {
  return apiFetch<TagSummary[]>(`${base(universeId)}/tags`, { signal })
}
