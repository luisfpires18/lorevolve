import type { ItemDrag } from './usePanZoom'

/** Where a dragged card or state is now, in canvas units. */
export interface Drop {
  id: string
  x: number
  y: number
}

/**
 * The drag of one card on a pan and zoom canvas (#456): the idea board's cards and the machine's states. While it
 * moves, `place` says where it lands (or `null` while it may not move) and `dropAt` and `setDragging` hold it; a
 * release after a move drops it there, a release without one is a press, and a cancel lets it go.
 */
export function itemDrag({
  id,
  x,
  y,
  scale,
  dropAt,
  setDragging,
  place,
  onDrop,
  onPress,
}: {
  id: string
  x: number
  y: number
  /** The view's scale in the render that made the drag. */
  scale: number
  /** The same drop, for the release to read: a state updater is no place to tell the editor. */
  dropAt: { current: Drop | null }
  setDragging: (drop: Drop | null) => void
  place: (x: number, y: number) => { x: number; y: number } | null
  onDrop: (x: number, y: number) => void
  onPress: () => void
}): ItemDrag {
  return {
    onMove: (_x, _y, dx, dy) => {
      const at = place(x + dx / scale, y + dy / scale)
      if (!at) return
      dropAt.current = { id, ...at }
      setDragging(dropAt.current)
    },
    onEnd: (moved) => {
      const drop = dropAt.current
      dropAt.current = null
      setDragging(null)
      if (moved && drop?.id === id) onDrop(drop.x, drop.y)
      else if (!moved) onPress()
    },
    onCancel: () => {
      dropAt.current = null
      setDragging(null)
    },
  }
}
