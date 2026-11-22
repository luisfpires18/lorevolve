import type { BoardCard } from './boards'

export const NOTE_SIZE = { width: 220, height: 140 }
export const LINKED_SIZE = { width: 240, height: 120 }

const GAP = 24

/**
 * Where a new card goes: the centre of the view, or the nearest place beside or below it that no card covers yet, so a
 * card added is never hidden under another. A crowded board takes the centre anyway.
 */
export function freeSpot(
  cards: BoardCard[],
  x: number,
  y: number,
  size: { width: number; height: number },
) {
  for (let step = 0; step < 12; step++) {
    const left = x + (step % 3) * (size.width + GAP)
    const top = y + Math.floor(step / 3) * (size.height + GAP)
    const covered = cards.some(
      (card) =>
        left < card.x + card.width &&
        left + size.width > card.x &&
        top < card.y + card.height &&
        top + size.height > card.y,
    )
    if (!covered) return { x: left, y: top }
  }
  return { x, y }
}
