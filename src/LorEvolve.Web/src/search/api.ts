import { apiFetch } from '../lib/api'
import { SearchField, SearchKind, type SearchResponse, type SearchResult } from './types'

/**
 * How much of what was typed is sent. The API reads no further than this, so anything past it would only lengthen the
 * address; counted in characters as a person sees them, so an emoji is never cut in half.
 */
export const SEARCH_MAX_LENGTH = 200

/** What is sent for `text`: trimmed, and at most `SEARCH_MAX_LENGTH` characters. Empty when there is nothing to search for. */
export function searchQuery(text: string) {
  return Array.from(text.trim()).slice(0, SEARCH_MAX_LENGTH).join('')
}

/** One search of one universe. Aborting it is how a newer search replaces it; an abort is not a failure. */
export function searchUniverse(universeId: string, query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query })
  return apiFetch<SearchResponse>(`/api/universes/${universeId}/search?${params.toString()}`, {
    signal,
  })
}

/**
 * Where a result opens: the existing place for that thing, never a page of its own. A scene or chapter lands on the
 * story's Scenes view and an arc or beat on its Plot view, scrolled to, focused and marked; a manuscript opens the scene's
 * writing; an entry whose words were only in its article opens at the article; a world rule opens that rule.
 */
export function resultPath(universeId: string, result: SearchResult) {
  const universe = `/app/universes/${universeId}`
  const story = `${universe}/stories/${result.storyId ?? ''}`

  switch (result.kind) {
    case SearchKind.Entity:
      return result.matchedIn === SearchField.Article
        ? `${universe}/lore/${result.id}#article`
        : `${universe}/lore/${result.id}`
    case SearchKind.Idea:
      return `${universe}/ideas/${result.id}`
    case SearchKind.WorldRule:
      return `${universe}/world-rules/${result.id}`
    case SearchKind.Story:
      return story
    case SearchKind.Chapter:
      return `${story}#chapter-${result.id}`
    case SearchKind.Scene:
      return `${story}#scene-${result.id}`
    case SearchKind.PlotArc:
      return `${story}/plot#arc-${result.id}`
    case SearchKind.PlotBeat:
      return `${story}/plot#beat-${result.id}`
    case SearchKind.Manuscript:
      return `${story}/manuscript/${result.id}`
  }
}

/** Where a result sits, in the words an author knows it by: an entry's type, a scene's story and chapter, a beat's arc. */
export function resultContext(result: SearchResult) {
  const chapter =
    result.chapterNumber !== null && result.chapterTitle !== null
      ? ` · Chapter ${result.chapterNumber}: ${result.chapterTitle}`
      : ''

  switch (result.kind) {
    case SearchKind.Entity:
      return result.entityTypeName
    case SearchKind.Chapter:
      return `Chapter ${result.chapterNumber ?? ''} of “${result.storyTitle ?? ''}”`
    case SearchKind.Scene:
    case SearchKind.Manuscript:
      return `In “${result.storyTitle ?? ''}”${chapter}`
    case SearchKind.PlotArc:
      return `In “${result.storyTitle ?? ''}”`
    case SearchKind.PlotBeat:
      return `In the arc “${result.plotArcTitle ?? ''}” of “${result.storyTitle ?? ''}”`
    default:
      return null
  }
}
