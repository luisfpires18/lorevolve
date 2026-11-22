import type { KeyboardEvent, RefObject } from 'react'
import type { BoardCard } from './boards'
import type { BoardSelection } from './boardSelection'
import { fitView, ZOOM_STEP, type usePanZoom } from '../lib/usePanZoom'

const PAN_STEP = 48
const MOVE_STEP = 10
const BIG_MOVE_STEP = 50

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
    const step = event.shiftKey ? BIG_MOVE_STEP : MOVE_STEP
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
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
    const about = { x: size.width / 2, y: size.height / 2 }
    switch (event.key) {
      case 'ArrowLeft':
        setView((current) => ({ ...current, x: current.x + PAN_STEP }))
        break
      case 'ArrowRight':
        setView((current) => ({ ...current, x: current.x - PAN_STEP }))
        break
      case 'ArrowUp':
        setView((current) => ({ ...current, y: current.y + PAN_STEP }))
        break
      case 'ArrowDown':
        setView((current) => ({ ...current, y: current.y - PAN_STEP }))
        break
      case '+':
      case '=':
        zoomAbout(ZOOM_STEP, about.x, about.y)
        break
      case '-':
      case '_':
        zoomAbout(1 / ZOOM_STEP, about.x, about.y)
        break
      case '0':
        setView(fitView(cards, size))
        break
      case 'Escape':
        if (!selected && !connecting) return
        onSelect(null)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return onStageKeyDown
}
