import { useEffect } from 'react'
import { isBlank, parseCopy, sameFields, type Fields } from './boardDraft'
import type { useBoardState } from './useBoardState'

/** What a board's editor holds against what is saved, and the recovery copy that follows it. */
export function useBoardDraft({
  load,
  isNew,
  draft,
  stored,
  found,
  discard,
  keep,
  forget,
}: ReturnType<typeof useBoardState>) {
  const isReady = load.kind === 'ready'
  const isDirty = isReady && (isNew ? !isBlank(draft) : !sameFields(draft, stored))

  const copy = found ? parseCopy(found.content) : null
  const isNothingToRecover = (fields: Fields) =>
    isNew ? isBlank(fields) : sameFields(fields, stored)
  const offer = isReady && found && copy && !isNothingToRecover(copy) ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  const isUselessCopy =
    isReady && found !== undefined && found !== null && (copy === null || isNothingToRecover(copy))
  useEffect(() => {
    if (isUselessCopy) discard()
  }, [isUselessCopy, discard])

  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) keep(JSON.stringify(draft), stored.updatedAt)
    else forget()
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  return { isReady, isDirty, copy, offer, isHeld }
}
