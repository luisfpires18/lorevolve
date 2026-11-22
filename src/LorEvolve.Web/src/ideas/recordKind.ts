import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import type { Load } from '../lib/useAsyncRead'
import type { useDraftedEditor } from '../lib/useDraftedEditor'
import type { DraftKind } from '../lib/localDrafts'
import type { LocalDraftState } from '../lib/useLocalDraft'

/** The read of the record, plus `elsewhere`: it exists, but not in the universe this editor is in. */
export type RecordLoad = Load<null> | { kind: 'elsewhere' }

export type FieldErrors = Record<string, string>

/** What a read record says of its universe. */
export interface Shelved {
  universe: { id: string } | null
}

/** What every record's fields hold: the title a save needs, and the universe the record is in. */
export interface BaseFields {
  title: string
  universeId: string | null
}

/**
 * One kind of record (an idea, a board) for `useRecordEditor`: its API, its words and its specifics. Defined once per
 * kind at module level, so the editor's read sees the same object on every render.
 */
export interface RecordKind<D extends Shelved, F extends BaseFields, S extends F, I> {
  /** The recovery copy's kind. */
  kind: DraftKind
  /** The record's keys: `ideas.editor` or `ideas.board`. */
  words: 'ideas.editor' | 'ideas.board'
  /** The 409 code of a save over a version saved elsewhere. */
  changedCode: string
  /** What a new record starts as, in the universe it was started from. */
  blank: (universeId: string | null) => S
  read: (id: string, signal: AbortSignal) => Promise<D>
  create: (input: I) => Promise<D>
  update: (id: string, input: I) => Promise<D>
  delete: (id: string) => Promise<unknown>
  toStored: (record: D) => S
  toFields: (stored: S) => F
  toInput: (fields: F, expectedUpdatedAt: string | null, stored: S) => I
  same: (a: F, b: F) => boolean
  /** How many parts of the fields need their universe, and the fields without them. */
  dependentsOf: (fields: F) => { count: number; without: F }
  /** Clears the field errors an edit answers (G8: each record its own way). */
  clearErrors: (
    change: Partial<F>,
    fieldErrors: FieldErrors,
    setFieldErrors: Dispatch<SetStateAction<FieldErrors>>,
  ) => void
  /** The message when a 400 names fields. */
  needChange: (fieldErrors: FieldErrors) => string | null
  /** The announcement once the recovery copy is discarded. */
  discarded: (isNew: boolean) => string
}

/** What the record's `useDraft` step reads: the record as it is held, and its recovery copy. */
export interface RecordState<F, S> extends Pick<
  LocalDraftState,
  'found' | 'keep' | 'forget' | 'discard'
> {
  isNew: boolean
  load: RecordLoad
  draft: F
  stored: S
  titleInput: RefObject<HTMLInputElement | null>
}

/** The `useDraftedEditor` step's answer; `isTooLong` holds a save back. */
export type Drafted<F> = ReturnType<typeof useDraftedEditor<F>> & { isTooLong?: boolean }

/** A key of the record's words. */
export function wordKey(words: 'ideas.editor' | 'ideas.board', name: string) {
  return `${words}.${name}` as TextKey<Dictionary>
}

/** The stored moment a stale save's refusal reports, when it carries one. */
export function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

/** The universe the draft is in: from the account's list, or the record's own while the list lacks it. */
export function chosenUniverseOf<U extends { id: string; name: string }>(
  universes: U[] | null,
  universeId: string | null,
  own: { id: string; name: string } | null,
) {
  return (
    universes?.find((universe) => universe.id === universeId) ??
    (own && own.id === universeId ? own : null)
  )
}
