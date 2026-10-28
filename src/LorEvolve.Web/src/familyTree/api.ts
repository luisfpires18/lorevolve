import { apiFetch } from '../lib/api'
import type { FamilyDiscoveryPage, FamilyTree } from './types'

/**
 * One entry's family, two generations each way, derived by the server from explicit parent links. A
 * bounded view model rather than the universe's relationships: nothing else is downloaded to draw it.
 */
export function getFamilyTree(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<FamilyTree>(`/api/universes/${universeId}/family-tree/${entityId}`, { signal })
}

/**
 * The families a universe already holds - groups of entries joined by family links - as summaries to choose from. Never a tree:
 * the tree is read only for the family chosen. `q` matches any member's name; each family comes back once.
 */
export function listFamilies(
  universeId: string,
  query: { q: string; page: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(query.page) })
  if (query.q.trim()) params.set('q', query.q.trim())
  return apiFetch<FamilyDiscoveryPage>(
    `/api/universes/${universeId}/family-tree/families?${params}`,
    { signal },
  )
}
