import type { UniverseArtworkRef } from '../publishing/types'

/**
 * The CoverDrawer's `onChanged` for the card a shelf is covering: the drawer shows the new cover at once, and `apply`
 * puts it on the shelf's own list (stories, or projects).
 */
export function shelfCoverChange<T extends { id: string; cover?: UniverseArtworkRef | null }>(
  covering: T,
  setCovering: (next: T) => void,
  apply: (id: string, cover: UniverseArtworkRef | null) => void,
) {
  return (cover: UniverseArtworkRef | null) => {
    setCovering({ ...covering, cover })
    apply(covering.id, cover)
  }
}
