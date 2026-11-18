import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { EraDraft } from './eraDrafts'

/** Moves the focus to a period just added, once its row is drawn. */
export function useFocusNewEra({
  focusNew,
  drafts,
}: {
  focusNew: RefObject<string | null>
  drafts: EraDraft[]
}) {
  useEffect(() => {
    if (!focusNew.current) return
    document.getElementById(focusNew.current)?.focus()
    focusNew.current = null
  }, [drafts])
}
