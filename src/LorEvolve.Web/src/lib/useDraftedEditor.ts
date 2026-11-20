import { useEffect } from 'react'
import { useLeaveGuard } from './leaveGuard'
import type { LocalDraftState } from './useLocalDraft'

interface DraftedEditorArgs<F> extends Pick<
  LocalDraftState,
  'found' | 'keep' | 'forget' | 'discard'
> {
  /** The saved version has been read. */
  isReady: boolean
  isNew: boolean
  draft: F
  stored: F & { updatedAt: string | null }
  /** True for fields with nothing written: a new editor's draft is dirty once this is false. */
  isBlank: (fields: F) => boolean
  same: (a: F, b: F) => boolean
  /** The recovery copy's content read back, or null when this editor could not have written it. */
  parseCopy: (content: string) => F | null
  /** The leave question while the draft differs from what is saved. */
  leaveMessage: string
}

/**
 * What an editor with a recovery copy holds against what is saved: whether it is dirty, the copy worth offering, and
 * whether the copy holds the editor until the author answers. A copy with nothing to recover goes without a word, the
 * copy follows the writing, and leaving with unsaved writing asks `leaveMessage` first and drops the copy.
 */
export function useDraftedEditor<F>({
  isReady,
  isNew,
  draft,
  stored,
  found,
  keep,
  forget,
  discard,
  isBlank,
  same,
  parseCopy,
  leaveMessage,
}: DraftedEditorArgs<F>) {
  const isDirty = isReady && (isNew ? !isBlank(draft) : !same(draft, stored))

  // A copy is worth offering when it holds something the saved version does not - for a new one, anything written.
  const copy = found ? parseCopy(found.content) : null
  const isNothingToRecover = (fields: F) => (isNew ? isBlank(fields) : same(fields, stored))
  const offer = isReady && found && copy && !isNothingToRecover(copy) ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  // A copy identical to what is saved, or one this editor could not have written, goes without a word.
  const isUselessCopy =
    isReady && found !== undefined && found !== null && (copy === null || isNothingToRecover(copy))
  useEffect(() => {
    if (isUselessCopy) discard()
  }, [isUselessCopy, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) keep(JSON.stringify(draft), stored.updatedAt)
    else forget()
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  useLeaveGuard(isDirty ? leaveMessage : null, discard)

  return { isReady, isDirty, copy, offer, isHeld }
}
