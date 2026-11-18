import { useEffect } from 'react'

export function useScriptShortcut({ save }: { save: () => Promise<void> }) {
  // Ctrl+S or Cmd+S saves the open part, as the Manuscript does.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })
}
