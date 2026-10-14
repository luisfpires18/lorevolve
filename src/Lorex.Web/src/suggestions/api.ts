import { apiFetch } from '../lib/api'
import type { CommentSubject } from '../comments/api'
import type { ChronologyValue } from '../chronology/types'
import type { CanonStatusValue, EntityInput, FieldValue } from '../lore/types'
import type { SceneInput, SceneLoreReference, StoryInput, StoryStatusValue } from '../stories/types'

/** What a suggestion can be about: the same three subjects review comments have. */
export type SuggestionSubject = CommentSubject

export const SuggestionStatus = {
  Open: 0,
  Accepted: 1,
  Rejected: 2,
} as const

export type SuggestionStatusValue = (typeof SuggestionStatus)[keyof typeof SuggestionStatus]

/** An entry's form as a suggestion holds it: names beside ids, so it still reads after a rename. */
export interface EntrySuggestion {
  entityTypeId: string
  entityTypeName: string
  name: string
  summary: string | null
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: FieldValue[]
}

export interface StorySuggestion {
  title: string
  premise: string | null
  status: StoryStatusValue
}

export interface SceneSuggestion {
  title: string
  chapterId: string | null
  summary: string | null
  notes: string | null
  pov: SceneLoreReference | null
  chronology: ChronologyValue | null
  entities: SceneLoreReference[]
}

/**
 * One suggestion (task 045). `before` is the content as it was when the suggestion was made, `proposed` the same form with
 * the suggestion applied. `targetChanged`: still open, and the content was saved since, so it can only be rejected.
 */
export interface Suggestion<T> {
  id: string
  status: SuggestionStatusValue
  /** Usernames only; null when the account can no longer be found. */
  proposedByName: string | null
  createdAt: string
  resolvedByName: string | null
  resolvedAt: string | null
  targetChanged: boolean
  before: T
  proposed: T
}

/** The 409 an accept gets when the content was saved after the suggestion was made. */
export const SUGGESTION_TARGET_CHANGED = 'suggestion_target_changed'

/** The 409 an accept or reject gets when someone else decided it first. */
export const SUGGESTION_RESOLVED = 'suggestion_resolved'

/** Where a subject's suggestions are read and sent. */
export function suggestionsPath(universeId: string, subject: SuggestionSubject) {
  const universe = `/api/universes/${universeId}`
  switch (subject.kind) {
    case 'entry':
      return `${universe}/entities/${subject.entityId}/suggestions`
    case 'story':
      return `${universe}/stories/${subject.storyId}/suggestions`
    case 'scene':
      return `${universe}/stories/${subject.storyId}/scenes/${subject.sceneId}/suggestions`
  }
}

/** Open first, then decided, newest first within each. */
export function listSuggestions<T>(path: string, signal?: AbortSignal) {
  return apiFetch<Suggestion<T>[]>(path, { signal })
}

/** The form's ordinary save body - the version it was opened on included - sent as a suggestion instead. */
function suggest<T>(path: string, input: object) {
  return apiFetch<Suggestion<T>>(path, { method: 'POST', body: JSON.stringify(input) })
}

export const suggestEntryChanges = (universeId: string, entityId: string, input: EntityInput) =>
  suggest<EntrySuggestion>(suggestionsPath(universeId, { kind: 'entry', entityId }), input)

export const suggestStoryChanges = (universeId: string, storyId: string, input: StoryInput) =>
  suggest<StorySuggestion>(suggestionsPath(universeId, { kind: 'story', storyId }), input)

export const suggestSceneChanges = (
  universeId: string,
  storyId: string,
  sceneId: string,
  input: SceneInput,
) =>
  suggest<SceneSuggestion>(suggestionsPath(universeId, { kind: 'scene', storyId, sceneId }), input)

export function resolveSuggestion<T>(
  universeId: string,
  suggestionId: string,
  decision: 'accept' | 'reject',
) {
  return apiFetch<Suggestion<T>>(
    `/api/universes/${universeId}/suggestions/${suggestionId}/${decision}`,
    { method: 'POST' },
  )
}
