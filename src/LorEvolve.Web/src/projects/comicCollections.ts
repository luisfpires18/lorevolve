import { apiFetch } from '../lib/api'

/** A node of a Comic project a story arc or event can reference (#296). */
export type ComicNode = {
  nodeId: string
  projectId: string
  projectName: string
  level: string
  title: string | null
}

/** An entry in reading order; `available` is false when its node no longer fits the collection. */
export type ComicEntry = ComicNode & { available: boolean }

export type ComicCollectionKind = 'story-arc' | 'event'

export type ComicCollection = {
  id: string
  kind: ComicCollectionKind
  name: string
  summary: string | null
  sortOrder: number
  version: number
  entries: ComicEntry[]
}

export type ComicCollections = { collections: ComicCollection[]; candidates: ComicNode[] }

export type ComicCollectionInput = {
  kind?: ComicCollectionKind
  name: string
  summary: string | null
  expectedVersion?: number
}

const base = (universeId: string) => `/api/universes/${universeId}/comic-collections`
const post = (url: string, body: unknown) =>
  apiFetch<void>(url, { method: 'POST', body: JSON.stringify(body) })

export const listComicCollections = (universeId: string, signal?: AbortSignal) =>
  apiFetch<ComicCollections>(base(universeId), { signal })

export const createComicCollection = (universeId: string, input: ComicCollectionInput) =>
  post(base(universeId), input)

export const saveComicCollection = (universeId: string, id: string, input: ComicCollectionInput) =>
  apiFetch<void>(`${base(universeId)}/${id}`, { method: 'PUT', body: JSON.stringify(input) })

export const deleteComicCollection = (universeId: string, id: string) =>
  apiFetch<void>(`${base(universeId)}/${id}`, { method: 'DELETE' })

export const moveComicCollection = (universeId: string, id: string, place: number) =>
  post(`${base(universeId)}/${id}/move`, { place })

export const addComicEntry = (universeId: string, id: string, nodeId: string) =>
  post(`${base(universeId)}/${id}/entries`, { nodeId })

export const removeComicEntry = (universeId: string, id: string, nodeId: string) =>
  apiFetch<void>(`${base(universeId)}/${id}/entries/${nodeId}`, { method: 'DELETE' })

export const moveComicEntry = (universeId: string, id: string, nodeId: string, place: number) =>
  post(`${base(universeId)}/${id}/entries/${nodeId}/move`, { place })
