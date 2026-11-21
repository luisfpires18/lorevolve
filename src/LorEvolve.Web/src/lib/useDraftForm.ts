import { useState } from 'react'
import { payloadKey } from './drawerGuard'

/**
 * A form's draft: read once from what is saved (`from`), changed field by field with `edit`, and measured against
 * that opening copy for `isDirty`. `measure` is the draft as the save would send it (default: as it stands), so a
 * field typed into and cleared again reads as untouched. `start` makes the draft differ from the copy it is measured
 * against (a scene opening on a new beat). After a refused save the form adopts the latest with `setInitial`, and
 * `setDraft` as well when it takes the latest's words. Catalogue: `docs/design/ui-components.md`.
 */
export function useDraftForm<D extends object>(
  from: () => D,
  { measure, start }: { measure?: (draft: D) => object; start?: (initial: D) => D } = {},
) {
  const [initial, setInitial] = useState(from)
  const [draft, setDraft] = useState(() => (start ? start(initial) : initial))
  const read = measure ?? ((value: D) => value)
  const isDirty = payloadKey(read(draft)) !== payloadKey(read(initial))

  function edit(change: Partial<D>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  return { initial, setInitial, draft, setDraft, edit, isDirty }
}
