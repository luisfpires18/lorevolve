import { useEffect, useRef, type RefObject } from 'react'

/** Ctrl or Cmd + S, no Alt. The one place the app reads the save shortcut. */
export function isSaveShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's'
}

/**
 * Ctrl or Cmd + S calls `save`, in a textarea too, and keeps the browser from saving the page. One listener on the
 * document while `enabled`; it always calls the newest `save`, and leaves alone a key press something already took.
 * With `scope`, it acts only when the focus is inside that element, on the page's body or nowhere.
 */
export function useSaveShortcut(
  save: () => void,
  { enabled = true, scope }: { enabled?: boolean; scope?: RefObject<HTMLElement | null> } = {},
) {
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  })

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !isSaveShortcut(event)) return
      if (scope) {
        const focused = document.activeElement
        const inside =
          focused === null || focused === document.body || scope.current?.contains(focused)
        if (!inside) return
      }
      event.preventDefault()
      latest.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, scope])
}
