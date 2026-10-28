import { apiFetch } from '../lib/api'
import type { UniverseDetail, UniverseInput, UniversePage, UniverseQuery } from './types'

const BASE = '/api/universes'

export const PAGE_SIZE = 12

export function listUniverses(query: UniverseQuery, signal?: AbortSignal, pageSize = PAGE_SIZE) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(pageSize),
    includeArchived: String(query.includeArchived),
  })
  if (query.search.trim()) {
    params.set('search', query.search.trim())
  }

  return apiFetch<UniversePage>(`${BASE}?${params.toString()}`, { signal })
}

export function getUniverse(id: string, signal?: AbortSignal) {
  return apiFetch<UniverseDetail>(`${BASE}/${id}`, { signal })
}

export function createUniverse(input: UniverseInput) {
  return apiFetch<UniverseDetail>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function updateUniverse(id: string, input: UniverseInput) {
  return apiFetch<UniverseDetail>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function setUniverseArchived(id: string, archived: boolean) {
  return apiFetch<UniverseDetail>(`${BASE}/${id}/${archived ? 'archive' : 'unarchive'}`, {
    method: 'POST',
  })
}

export function deleteUniverse(id: string) {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
