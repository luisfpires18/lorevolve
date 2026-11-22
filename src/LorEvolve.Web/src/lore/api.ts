import { FIELD_FILTER_PARAM, encodeFieldFilter } from './fieldFilters'
import { apiFetch } from '../lib/api'
import type {
  BulkCreatedEntity,
  BulkEntityRow,
  EntityDetail,
  EntityInput,
  EntityPage,
  EntityQuery,
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
  if (query.exact && query.search.trim()) params.set('exact', 'true')
  if (query.namesOnly && query.search.trim()) params.set('namesOnly', 'true')
  if (query.sort) params.set('sort', query.sort)
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
