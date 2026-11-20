import { useEffect, useRef } from 'react'
import { useDraftedEditor } from '../lib/useDraftedEditor'
import { IDEA_BODY_MAX_LENGTH } from './types'
import { isBlank, parseCopy, sameFields } from './ideaDraft'
import type { useIdeaState } from './useIdeaState'

/** What an idea's editor holds against what is saved, and the recovery copy that follows it. */
export function useIdeaDraft(
  { load, isNew, draft, stored, found, discard, keep, forget, titleInput }: ReturnType<typeof useIdeaState>,
  leaveMessage: string,
) {
  const drafted = useDraftedEditor({
    isReady: load.kind === 'ready',
    isNew,
    draft,
    stored,
    found,
    keep,
    forget,
    discard,
    isBlank,
    same: sameFields,
    parseCopy,
    leaveMessage,
  })
  const isTooLong = draft.body.length > IDEA_BODY_MAX_LENGTH
  const { isHeld } = drafted

  // A new idea starts in its title, once any copy has been looked for.
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!isNew || isHeld || focusedOnce.current) return
    focusedOnce.current = true
    titleInput.current?.focus()
  }, [isNew, isHeld])

  return { ...drafted, isTooLong }
}
