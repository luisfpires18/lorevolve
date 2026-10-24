import { apiFetch } from '../lib/api'

/** The longest private note the API keeps, as the API counts characters. */
export const PRIVATE_NOTE_MAX_LENGTH = 20_000

/** The 409 for a note saved over a version that is no longer the latest (ADR 0043). */
export const PRIVATE_NOTE_CHANGED = 'entity_private_note_changed'

/**
 * The owner's private note on an entry (issue 23), as the API answers it: `content` is `''` and `updatedAt` null until the
 * first save, and `version` is what the next save names - 0 until then.
 */
export interface PrivateNote {
  entityId: string
  content: string
  updatedAt: string | null
  version: number
}

export interface PrivateNoteInput {
  content: string
  expectedVersion: number
}

const note = (universeId: string, entityId: string) =>
  `/api/universes/${universeId}/entities/${entityId}/private-note`

export function getPrivateNote(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<PrivateNote>(note(universeId, entityId), { signal })
}

/** Replaces the note with exactly `input.content`, if `input.expectedVersion` is still the latest save. */
export function savePrivateNote(universeId: string, entityId: string, input: PrivateNoteInput) {
  return apiFetch<PrivateNote>(note(universeId, entityId), {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
