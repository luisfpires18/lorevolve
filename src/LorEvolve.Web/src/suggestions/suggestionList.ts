import type { Suggestion, SuggestionState } from './api'

export type Feedback = { text: string; isError: boolean }

/**
 * What has been read: every suggestion so far, and for each list whether older ones follow and where the next page starts
 * - the last one that list answered, whatever has been decided here since.
 */
export interface Loaded<T> {
  items: Suggestion<T>[]
  more: Record<SuggestionState, boolean>
  after: Record<SuggestionState, string | null>
}

export const STATES: SuggestionState[] = ['open', 'decided']

export const CHANGED_SINCE = {
  entry: 'review.suggestions.changed.entry',
  story: 'review.suggestions.changed.story',
  scene: 'review.suggestions.changed.scene',
} as const

/** Newest first, then by id: the API's own order, kept when a decision moves one from a list to the other. */
export function newestFirst<T>(a: Suggestion<T>, b: Suggestion<T>) {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? 1 : -1
}

/** Adds what a page answered, each suggestion once, a newer read of one replacing the older. */
export function merged<T>(items: Suggestion<T>[], read: Suggestion<T>[]) {
  const fresh = new Map(read.map((each) => [each.id, each]))
  return [...items.filter((each) => !fresh.has(each.id)), ...read]
}
