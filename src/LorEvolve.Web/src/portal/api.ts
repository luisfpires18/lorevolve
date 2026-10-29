import { apiFetch } from '../lib/api'
import type { CategoryValue, GenreValue } from '../publishing/types'

/**
 * A public universe, exactly as the anonymous API gives it: an allow-list of nine members, none of them
 * ever null. No id, no account, nothing inside the universe (ADR 0036). `authorSlug` is the author's public
 * address (ADR 0037), never an account id.
 */
export interface PublicUniverse {
  slug: string
  name: string
  publicSummary: string
  category: CategoryValue
  genres: GenreValue[]
  authorDisplayName: string
  authorSlug: string
  /** Same-origin, and answered only while the universe is public. */
  cardImageUrl: string
  publishedAt: string
  /**
   * Who created the work this world is based on (ADR 0039), or null for a world of its author's own. Only a name: never a
   * LorEvolve account, never linked. When set, the author is the world's curator on LorEvolve.
   */
  originalCreator: string | null
  originalWork: string | null
}

export interface PublicUniversePage {
  items: PublicUniverse[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

const BASE = '/api/public/universes'

/**
 * What Explore asks for, in the public API's own terms: category and genre keys (`games`, `science-fiction`),
 * a search over the public fields, and `az` or the default, most recently published first.
 */
export interface ExploreQuery {
  category?: string
  genre?: string
  q?: string
  sort?: 'az'
  /** One author's public worlds, by their address - for the author page. */
  author?: string
}

/**
 * One page of public universes. Works signed in or out; sends nothing about the session. `pageSize` left out is the
 * API's own (24); the home page asks for the few it shows.
 */
export function listPublicUniverses(
  query: ExploreQuery,
  page: number,
  signal?: AbortSignal,
  pageSize?: number,
) {
  const params = new URLSearchParams({ page: String(page) })
  if (pageSize) params.set('pageSize', String(pageSize))
  for (const [name, value] of Object.entries(query)) {
    if (value) params.set(name, value)
  }
  return apiFetch<PublicUniversePage>(`${BASE}?${params}`, { signal })
}

/** One public universe by its address. A private or missing one is the same 404. */
export function getPublicUniverse(slug: string, signal?: AbortSignal) {
  return apiFetch<PublicUniverse>(`${BASE}/${encodeURIComponent(slug)}`, { signal })
}

/** The page a public universe lives at. */
export function worldPath(slug: string) {
  return `/worlds/${slug}`
}

export function lorePath(world: string, lore: string) {
  return `/worlds/${world}/lore/${lore}`
}

export function storyPath(world: string, story: string) {
  return `/worlds/${world}/stories/${story}`
}

export function authorPath(author: string) {
  return `/authors/${author}`
}

// ---------- Inside a public universe (Tasks 010-011) ----------

/** A published lore entry in its universe's listing: exactly what the API allow-lists. */
export interface PublicLoreEntry {
  slug: string
  name: string
  /** The entry's own one-or-two-line lead, or null. */
  summary: string | null
  typeName: string
  /** The entry's square thumbnail, answered only while it is public; null when it has no picture. */
  thumbnailUrl: string | null
  publishedAt: string
}

/** A published entry's own page: its listing plus its article - the Tiptap document, workspace links removed. */
export interface PublicLoreDetail extends PublicLoreEntry {
  article: string | null
}

/** A published story, in a listing: never its premise or anything inside it. */
export interface PublicStory {
  slug: string
  title: string
  publicSummary: string
  publishedAt: string
}

/**
 * A published story's own page (ADR 0039): its listing plus exactly what its author published inside it, in the author's
 * order - scene prose, scene outlines, plot arcs. Nothing here says what is not published.
 */
export interface PublicStoryDetail extends PublicStory {
  /** Each mention is its name in `text`; `links` marks those whose entry is published, by where the name sits. */
  manuscript: {
    title: string
    text: string
    links: { start: number; length: number; loreSlug: string }[]
  }[]
  scenes: { title: string; summary: string | null }[]
  plot: {
    title: string
    description: string | null
    beats: { title: string; description: string | null }[]
  }[]
}

export interface PublicContentPage<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** An author, as anyone may read them: address, public name, and their photo's square only if they chose to show it. */
export interface PublicAuthor {
  slug: string
  displayName: string
  avatarUrl: string | null
}

const at = (slug: string) => `${BASE}/${encodeURIComponent(slug)}`

export function listPublicLore(world: string, page: number, signal?: AbortSignal) {
  return apiFetch<PublicContentPage<PublicLoreEntry>>(`${at(world)}/lore?page=${page}`, { signal })
}

export function listPublicStories(world: string, page: number, signal?: AbortSignal) {
  return apiFetch<PublicContentPage<PublicStory>>(`${at(world)}/stories?page=${page}`, { signal })
}

export function getPublicLore(world: string, lore: string, signal?: AbortSignal) {
  return apiFetch<PublicLoreDetail>(`${at(world)}/lore/${encodeURIComponent(lore)}`, { signal })
}

export function getPublicStory(world: string, story: string, signal?: AbortSignal) {
  return apiFetch<PublicStoryDetail>(`${at(world)}/stories/${encodeURIComponent(story)}`, {
    signal,
  })
}

export function getPublicAuthor(author: string, signal?: AbortSignal) {
  return apiFetch<PublicAuthor>(`/api/public/authors/${encodeURIComponent(author)}`, { signal })
}

/**
 * Where the signed-in owner edits what a public address shows (Task 011). Answered only to its owner - anyone else
 * gets a 404 - so the anonymous pages never carry an id or an owner.
 */
export interface WorkspaceLink {
  universeId: string
  entityId: string | null
  storyId: string | null
}

export function getWorkspaceLink(
  world: string,
  child: { lore?: string; story?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (child.lore) params.set('lore', child.lore)
  if (child.story) params.set('story', child.story)
  const query = params.toString()
  return apiFetch<WorkspaceLink>(
    `/api/universes/by-address/${encodeURIComponent(world)}${query ? `?${query}` : ''}`,
    { signal },
  )
}

/** LorEvolve in four numbers, for its home page (031): counts only, the same for everyone. */
export interface PublicStats {
  creators: number
  universes: number
  publishedWorlds: number
  privateWorlds: number
}

export function getPublicStats(signal?: AbortSignal) {
  return apiFetch<PublicStats>('/api/public/stats', { signal })
}
