import { apiFetch } from '../lib/api'
import { listUniverses } from '../universes/api'
import { UniverseRole, type UniverseSummary } from '../universes/types'
import {
  IdeaReferenceKind,
  type IdeaDetail,
  type IdeaInput,
  type IdeaPage,
  type IdeaQuery,
  type IdeaReference,
  type IdeaReferenceKindValue,
} from './types'

const BASE = '/api/ideas'

export const IDEA_PAGE_SIZE = 20

/** The code on the 409 a save gets when the idea was saved somewhere else after it was opened here. */
export const IDEA_CHANGED = 'idea_changed'

export function listIdeas(query: IdeaQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(IDEA_PAGE_SIZE) })
  if (query.universeId) params.set('universeId', query.universeId)
  if (query.universeId && query.storyId) params.set('storyId', query.storyId)
  if (query.unassigned) params.set('unassigned', 'true')
  if (query.deleted) params.set('deleted', 'true')
  if (query.search.trim()) params.set('search', query.search.trim())

  return apiFetch<IdeaPage>(`${BASE}?${params.toString()}`, { signal })
}

export function getIdea(id: string, signal?: AbortSignal) {
  return apiFetch<IdeaDetail>(`${BASE}/${id}`, { signal })
}

export function createIdea(input: IdeaInput) {
  return apiFetch<IdeaDetail>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function saveIdea(id: string, input: IdeaInput) {
  return apiFetch<IdeaDetail>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

/** Into the account's deleted ideas, whole: a restore brings back its title, body, universe and references. */
export function deleteIdea(id: string) {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}

export function restoreIdea(id: string) {
  return apiFetch<IdeaDetail>(`${BASE}/${id}/restore`, { method: 'POST' })
}

/** Live targets of one kind in a universe, by name, narrowed by `search`. Nothing in the Trash is offered. */
export function listReferenceTargets(
  universeId: string,
  kind: IdeaReferenceKindValue,
  search: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ universeId, kind: String(kind) })
  if (search.trim()) params.set('search', search.trim())
  return apiFetch<IdeaReference[]>(`${BASE}/reference-targets?${params.toString()}`, { signal })
}

/**
 * Every universe the account owns, archived ones included, by name - for choosing an idea's universe and filtering by one.
 * Read a page at a time at the largest size the API allows, so a long list costs a few requests, not one per world.
 */
export async function listAllUniverses(signal?: AbortSignal) {
  const all: UniverseSummary[] = []
  for (let page = 1; ; page++) {
    const result = await listUniverses({ search: '', includeArchived: true, page }, signal, 50)
    // Owned only: an idea may point into a universe its author owns, never one shared with them (ADR 0030 amendment).
    all.push(...result.items.filter((universe) => universe.accessRole === UniverseRole.Owner))
    if (page >= result.totalPages) break
  }
  return all.sort((a, b) => a.name.localeCompare(b.name))
}

/** Where a reference is opened, inside the universe its idea belongs to. */
export function referencePath(universeId: string, reference: IdeaReference) {
  const universe = `/app/universes/${universeId}`
  const story = `${universe}/stories/${reference.storyId ?? ''}`

  switch (reference.kind) {
    case IdeaReferenceKind.Entity:
      return `${universe}/lore/${reference.id}`
    case IdeaReferenceKind.Story:
      return story
    case IdeaReferenceKind.Scene:
      return `${story}#scene-${reference.id}`
    case IdeaReferenceKind.PlotArc:
      return `${story}/plot#arc-${reference.id}`
    case IdeaReferenceKind.PlotBeat:
      return `${story}/plot#beat-${reference.id}`
  }
}

/** Where a reference sits, in the words an author knows it by: an entry's type, a scene's story, a beat's arc. */
export function referenceContext(reference: IdeaReference) {
  switch (reference.kind) {
    case IdeaReferenceKind.Entity:
      return reference.entityTypeName
    case IdeaReferenceKind.Story:
      return null
    case IdeaReferenceKind.PlotBeat:
      return `In “${reference.plotArcTitle ?? ''}” of “${reference.storyTitle ?? ''}”`
    default:
      return `In “${reference.storyTitle ?? ''}”`
  }
}
