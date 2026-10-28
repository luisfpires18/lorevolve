import type { SearchExcerptPart } from '../lore/types'

/** Mirrors the backend enum. What a search result is - explicit on every result, never guessed from an id or a name. */
export const SearchKind = {
  Entity: 0,
  Story: 1,
  Chapter: 2,
  Scene: 3,
  PlotArc: 4,
  PlotBeat: 5,
  Manuscript: 6,
  Idea: 7,
  WorldRule: 8,
} as const

export type SearchKindValue = (typeof SearchKind)[keyof typeof SearchKind]

/** How each kind is named on a result. Words, never a colour or an icon alone; "Arc" and "Beat", as everywhere else. */
export const SEARCH_KIND_LABELS: Record<SearchKindValue, string> = {
  [SearchKind.Entity]: 'Lore',
  [SearchKind.Story]: 'Story',
  [SearchKind.Chapter]: 'Chapter',
  [SearchKind.Scene]: 'Scene',
  [SearchKind.PlotArc]: 'Arc',
  [SearchKind.PlotBeat]: 'Beat',
  [SearchKind.Manuscript]: 'Manuscript',
  [SearchKind.Idea]: 'Idea',
  [SearchKind.WorldRule]: 'World rule',
}

/** Mirrors the backend enum. Where the searched words were found - the narrowest place that holds all of them. */
export const SearchField = {
  Title: 0,
  Alias: 1,
  Summary: 2,
  Premise: 3,
  Description: 4,
  Notes: 5,
  Body: 6,
  Article: 7,
  Prose: 8,
} as const

export type SearchFieldValue = (typeof SearchField)[keyof typeof SearchField]

/** The words that say where an excerpt comes from. A title match carries no excerpt, so it has none. */
export const SEARCH_FIELD_LABELS: Record<SearchFieldValue, string | null> = {
  [SearchField.Title]: null,
  [SearchField.Alias]: 'Also known as',
  [SearchField.Summary]: 'In the summary',
  [SearchField.Premise]: 'In the premise',
  [SearchField.Description]: 'In the description',
  [SearchField.Notes]: 'In the notes',
  [SearchField.Body]: 'In the idea',
  [SearchField.Article]: 'In the article',
  [SearchField.Prose]: 'In the prose',
}

/**
 * One thing in the universe that holds the searched words, with only what its row needs.
 *
 * `id` is the thing's own id - a manuscript's is its scene's. `excerpt` is a few words around the match, as runs of
 * plain text, only when the match was not the title. The context members are set where they mean something: the entry's
 * type; `storyId` for everything from a story (a story's own id for a story) and `storyTitle` for what sits inside one;
 * the chapter a scene or manuscript is told in, and a chapter's own number; a beat's arc.
 */
export interface SearchResult {
  kind: SearchKindValue
  id: string
  title: string
  matchedIn: SearchFieldValue
  excerpt: SearchExcerptPart[] | null
  entityTypeName: string | null
  storyId: string | null
  storyTitle: string | null
  chapterTitle: string | null
  chapterNumber: number | null
  plotArcId: string | null
  plotArcTitle: string | null
}

/** The results of one search, best first, bounded per kind. `hasMore`: some kind holds more than it shows. */
export interface SearchResponse {
  results: SearchResult[]
  hasMore: boolean
}
