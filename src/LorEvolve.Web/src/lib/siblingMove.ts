export type MoveDirection = 'up' | 'down'

export type Sibling = {
  index: number
  count: number
  busy: boolean
  /** The place the row moves to, and the direction it took: one step from `index`. */
  to: (index: number, direction: MoveDirection) => void
  /** Keeps each Up and Down button, so the focus can come back after a move (a Lore type row). */
  buttonRef?: (direction: MoveDirection, element: HTMLButtonElement | null) => void
}

/** The `isFirst`, `isLast` and `onMove(direction)` that `MoveItems` needs, from a row's place in its list. */
export function siblingMove(sibling: Sibling) {
  const { index, count, busy, to, buttonRef } = sibling
  return {
    isFirst: index === 0,
    isLast: index === count - 1,
    busy,
    onMove: (direction: MoveDirection) => to(index + (direction === 'up' ? -1 : 1), direction),
    buttonRef,
  }
}
