import { apiFetch } from '../lib/api'

import type { EntityType, EntityTypeGroup } from './typeDefinitions'

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

/** A new group with no type in it yet, last in the priority. */
export function createEntityTypeGroup(universeId: string, name: string) {
  return apiFetch<EntityTypeGroup>(`${base(universeId)}/entity-type-groups`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** The universe's whole group priority, first first: every group exactly once. Answers the groups in their new order. */
export function reorderEntityTypeGroups(universeId: string, groupIds: string[]) {
  return apiFetch<EntityTypeGroup[]>(`${base(universeId)}/entity-type-groups/order`, {
    method: 'PUT',
    body: JSON.stringify({ groupIds }),
  })
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
