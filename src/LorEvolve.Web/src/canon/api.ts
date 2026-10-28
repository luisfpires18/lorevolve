import { apiFetch } from '../lib/api'
import type { CanonConflict, CanonConflictPage, CanonConflictQuery, CanonEvaluation } from './types'

/** Findings are prose, so a page holds about as many as the chronology does moments. */
export const CANON_PAGE_SIZE = 12

function base(universeId: string) {
  return `/api/universes/${universeId}/canon-conflicts`
}

export function listCanonConflicts(
  universeId: string,
  query: CanonConflictQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(CANON_PAGE_SIZE),
  })

  if (query.severity !== null) params.set('severity', String(query.severity))
  if (query.status !== null) params.set('status', String(query.status))

  return apiFetch<CanonConflictPage>(`${base(universeId)}?${params}`, { signal })
}

/** Re-derives the whole table from the lore as it stands now. */
export function evaluateCanonIntegrity(universeId: string) {
  return apiFetch<CanonEvaluation>(`${base(universeId)}/evaluate`, { method: 'POST' })
}

export function dismissCanonConflict(universeId: string, conflictId: string) {
  return apiFetch<CanonConflict>(`${base(universeId)}/${conflictId}/dismiss`, { method: 'POST' })
}

export function reopenCanonConflict(universeId: string, conflictId: string) {
  return apiFetch<CanonConflict>(`${base(universeId)}/${conflictId}/reopen`, { method: 'POST' })
}
