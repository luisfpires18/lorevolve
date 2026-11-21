import { useState } from 'react'

const NONE: ReadonlySet<string> = new Set()

/**
 * Select mode over the list on screen: whether it is on, and the ids selected in it. What is selected belongs to
 * `scope` (the page, filter, type or size the list is cut by): another scope is another list, so the selection is
 * dropped for good, set while rendering so no frame shows the old selection on the new list. `pageIds` are the ids
 * Select page takes. Callers add their own steps (focus, a lock, a request) around the verbs.
 */
export function useSelection({ scope, pageIds }: { scope: string; pageIds: string[] }) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<{ scope: string; ids: ReadonlySet<string> }>({
    scope,
    ids: NONE,
  })

  if (selection.scope !== scope) setSelection({ scope, ids: new Set() })
  const selectedIds = selection.scope === scope ? selection.ids : NONE

  function toggle(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection({ scope, ids: next })
  }

  function selectPage() {
    setSelection({ scope, ids: new Set(pageIds) })
  }

  function clear() {
    setSelection({ scope, ids: new Set() })
  }

  function stop() {
    clear()
    setIsSelecting(false)
  }

  return { isSelecting, setIsSelecting, selectedIds, toggle, selectPage, clear, stop }
}
