import type { KeyboardEvent, RefObject } from 'react'
import type { BoardCard } from './boards'
import type { BoardSelection } from './boardSelection'
import { arrowMove, panZoomKey } from '../lib/canvasKeys'
import { fitView, type usePanZoom } from '../lib/usePanZoom'

/** The board canvas's key handler for one card: the arrows move it, Escape lets go of the choice. */
export function cardKeyDown({
  stage,
  readOnly,
  connecting,
  selected,
  onMoveCard,
  onSelect,
}: {
  stage: RefObject<HTMLDivElement | null>
  readOnly: boolean
  connecting: string | null
  selected: BoardSelection
  onMoveCard: (cardId: string, x: number, y: number) => void
  onSelect: (selection: BoardSelection) => void
}) {
  function onCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, card: BoardCard) {
    const move = arrowMove(event)
    if (move && !readOnly) {
      event.preventDefault()
      event.stopPropagation()
      onMoveCard(card.id, card.x + move[0], card.y + move[1])
      onSelect({ kind: 'card', id: card.id })
      // Moving a card can move it in the reading order, and so in the page: the focus follows it there.
      requestAnimationFrame(() =>
        stage.current?.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)?.focus(),
      )
    } else if (event.key === 'Escape' && (connecting || selected)) {
      event.preventDefault()
      onSelect(null)
    }
  }

  return onCardKeyDown
}

/** The board canvas's key handler for the board itself: the arrows pan, plus and minus zoom, 0 fits. */
export function stageKeyDown({
  cards,
  selected,
  connecting,
  onSelect,
  size,
  setView,
  zoomAbout,
}: Pick<ReturnType<typeof usePanZoom>, 'size' | 'setView' | 'zoomAbout'> & {
  cards: BoardCard[]
  selected: BoardSelection
  connecting: string | null
  onSelect: (selection: BoardSelection) => void
}) {
  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Escape') {
      if (!selected && !connecting) return
      onSelect(null)
    } else if (
      !panZoomKey(event.key, { size, setView, zoomAbout, fit: () => fitView(cards, size) })
    )
      return
    event.preventDefault()
  }

  return onStageKeyDown
}
