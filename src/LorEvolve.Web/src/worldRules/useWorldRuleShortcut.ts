import { useEffect } from 'react'
import type { Stored } from './ruleDraft'
import type { useWorldRuleState } from './useWorldRuleState'

/** Ctrl+S and Cmd+S save the rule: the listener stays on the document and always calls the newest save. */
export function useWorldRuleShortcut({
  shortcut,
  save,
  stored,
}: Pick<ReturnType<typeof useWorldRuleState>, 'shortcut'> & {
  save: (expectedUpdatedAt: string | null) => Promise<void>
  stored: Stored
}) {
  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
