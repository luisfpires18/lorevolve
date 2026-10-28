import type { ChronologyValue } from '../chronology/types'
import { apiFetch } from '../lib/api'
import type {
  RelationshipDetail,
  RelationshipInput,
  RelationshipType,
  RelationshipTypeInput,
  RelationshipView,
} from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

// ---------- Relationship types ----------

export function listRelationshipTypes(universeId: string, signal?: AbortSignal) {
  return apiFetch<RelationshipType[]>(`${base(universeId)}/relationship-types`, { signal })
}

export function createRelationshipType(universeId: string, input: RelationshipTypeInput) {
  return apiFetch<RelationshipType>(`${base(universeId)}/relationship-types`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRelationshipType(
  universeId: string,
  typeId: string,
  input: RelationshipTypeInput,
) {
  return apiFetch<RelationshipType>(`${base(universeId)}/relationship-types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRelationshipType(universeId: string, typeId: string) {
  return apiFetch<void>(`${base(universeId)}/relationship-types/${typeId}`, { method: 'DELETE' })
}

// ---------- Relationships ----------

/**
 * Every link touching one entity, already worded from that entity's side. Asked about a time (Issue #18) - one of this entry's
 * eras, or a point on the universe's chronology - only the links that hold then, each with its `validity`.
 */
export function listEntityRelationships(
  universeId: string,
  entityId: string,
  signal?: AbortSignal,
  when?: { eraId: string } | { at: ChronologyValue },
) {
  const query = new URLSearchParams()
  if (when && 'eraId' in when) query.set('era', when.eraId)
  if (when && 'at' in when) {
    if (when.at.eraId) query.set('atEraId', when.at.eraId)
    if (when.at.year !== null) query.set('atYear', String(when.at.year))
    if (when.at.month !== null) query.set('atMonth', String(when.at.month))
    if (when.at.monthId) query.set('atMonthId', when.at.monthId)
    if (when.at.day !== null) query.set('atDay', String(when.at.day))
  }
  const search = query.toString()
  return apiFetch<RelationshipView[]>(
    `${base(universeId)}/entities/${entityId}/relationships${search ? `?${search}` : ''}`,
    { signal },
  )
}

export function createRelationship(universeId: string, input: RelationshipInput) {
  return apiFetch<RelationshipDetail>(`${base(universeId)}/relationships`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRelationship(
  universeId: string,
  relationshipId: string,
  input: RelationshipInput,
) {
  return apiFetch<RelationshipDetail>(`${base(universeId)}/relationships/${relationshipId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRelationship(universeId: string, relationshipId: string) {
  return apiFetch<void>(`${base(universeId)}/relationships/${relationshipId}`, {
    method: 'DELETE',
  })
}
