import { useEffect, useRef } from 'react'
import { IDEA_BODY_MAX_LENGTH } from './types'
import { isBlank, parseCopy, sameFields, type Fields } from './ideaDraft'
import type { useIdeaState } from './useIdeaState'

/** What an idea's editor holds against what is saved, and the recovery copy that follows it. */
export function useIdeaDraft({
  load,
  isNew,
  draft,
  stored,
  found,
  discard,
  keep,
  forget,
  titleInput,
}: ReturnType<typeof useIdeaState>) {
  const isReady = load.kind === 'ready'
  const isDirty = isReady && (isNew ? !isBlank(draft) : !sameFields(draft, stored))
  const isTooLong = draft.body.length > IDEA_BODY_MAX_LENGTH

  // A copy is worth offering when it holds something the saved idea does not - for a new idea, anything written at all.
  const copy = found ? parseCopy(found.content) : null
  const isNothingToRecover = (fields: Fields) =>
    isNew ? isBlank(fields) : sameFields(fields, stored)
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
    if (isDirty) {
      keep(JSON.stringify(draft), stored.updatedAt)
    } else {
      forget()
    }
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  // A new idea starts in its title, once any copy has been looked for.
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!isNew || isHeld || focusedOnce.current) return
    focusedOnce.current = true
    titleInput.current?.focus()
  }, [isNew, isHeld])

  return { isReady, isDirty, isTooLong, copy, offer, isHeld }
}
