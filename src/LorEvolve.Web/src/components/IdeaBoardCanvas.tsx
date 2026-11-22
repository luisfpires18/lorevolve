import { useRef, useState, type MutableRefObject } from 'react'
import { readingOrder, type BoardCard, type BoardConnection } from '../ideas/boards'
import type { BoardSelection } from '../ideas/boardSelection'
import { cardKeyDown, stageKeyDown } from '../ideas/boardCanvasKeys'
import { itemDrag } from '../lib/canvasDrag'
import { fitView, usePanZoom } from '../lib/usePanZoom'
import { useI18n } from '../i18n'
import { BoardCardButton } from './ideas/BoardCardButton'
import { BoardLines } from './ideas/BoardLines'
import { CanvasStage } from './CanvasStage'

interface IdeaBoardCanvasProps {
  title: string
  cards: BoardCard[]
  connections: BoardConnection[]
  selected: BoardSelection
  /** The card a line is being drawn from: the next card pressed is its other end. */
  connecting: string | null
  readOnly: boolean
  onSelect: (selection: BoardSelection) => void
  onConnectTo: (cardId: string) => void
  /** A card dropped somewhere new, by the pointer or the arrow keys, in board units. */
  onMoveCard: (cardId: string, x: number, y: number) => void
  /** Set by the canvas: the board point at the centre of the view, where a new card goes. */
  centreRef: MutableRefObject<(() => { x: number; y: number }) | null>
}

/**
 * The board itself: cards as real buttons on one transformed layer, lines as one SVG under them (ADR 0066).
 *
 * Pan, zoom and pinch are `usePanZoom`'s, shared with the map viewer. A card is pressed to choose it and dragged to move
 * it - mouse, pen or finger alike; while a line is being drawn, pressing a card ends the line there. A line is chosen by
 * pressing it. From the keyboard, Tab walks the cards in reading order, Enter or Space chooses one, the arrow keys move
 * the chosen card (Shift for bigger steps), and with the board itself focused the arrows pan, plus and minus zoom and 0
 * fits every card in view.
 */
export function IdeaBoardCanvas({
  title,
  cards,
  connections,
  selected,
  connecting,
  readOnly,
  onSelect,
  onConnectTo,
  onMoveCard,
  centreRef,
}: IdeaBoardCanvasProps) {
  const { t } = useI18n()
  const stage = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  // The same, for the release to read: a state updater is no place to tell the editor.
  const dropAt = useRef<{ id: string; x: number; y: number } | null>(null)

  const panZoom = usePanZoom(stage, {
    limits: () => ({ min: 0.1, max: 3 }),
    initial: (stageSize) => fitView(cards, stageSize),
    onTap: () => onSelect(null),
  })
  const { view, setView, size, zoomAbout, beginItemDrag } = panZoom

  function press(card: BoardCard) {
    if (connecting && connecting !== card.id) onConnectTo(card.id)
    else onSelect({ kind: 'card', id: card.id })
  }

  function cardDrag(card: BoardCard) {
    return itemDrag({
      id: card.id,
      x: card.x,
      y: card.y,
      scale: view.scale,
      dropAt,
      setDragging,
      place: (x, y) => (readOnly || connecting ? null : { x, y }),
      onDrop: (x, y) => {
        onMoveCard(card.id, x, y)
        onSelect({ kind: 'card', id: card.id })
      },
      onPress: () => press(card),
    })
  }

  // The handlers read `stage` on a key press, never during render.
  // oxlint-disable-next-line react/refs
  const onCardKeyDown = cardKeyDown({ stage, readOnly, connecting, selected, onMoveCard, onSelect })

  const onStageKeyDown = stageKeyDown({
    cards,
    selected,
    connecting,
    onSelect,
    size,
    setView,
    zoomAbout,
  })

  const placed = cards.map((card) =>
    dragging?.id === card.id ? { ...card, x: dragging.x, y: dragging.y } : card,
  )
  const byId = new Map(placed.map((card) => [card.id, card]))
  const drawOrder = new Map(cards.map((card, index) => [card.id, index]))

  return (
    <CanvasStage
      stage={stage}
      panZoom={panZoom}
      items={cards}
      label={t('ideas.canvas.board', { title: title || t('ideas.canvas.newBoard') })}
      testId="board"
      layerTestId="board-layer"
      connecting={connecting}
      onKeyDown={onStageKeyDown}
      fitLabel={t('ideas.canvas.fit')}
      hint={t('ideas.canvas.hint')}
      hintConnecting={t('ideas.canvas.hintConnecting')}
      centreRef={centreRef}
      focus={selected?.kind === 'card' ? cards.find((each) => each.id === selected.id) : undefined}
      focusOn={selected}
    >
      <BoardLines
        connections={connections}
        byId={byId}
        selected={selected}
        beginItemDrag={beginItemDrag}
        onSelect={onSelect}
      />

      {readingOrder(placed).map((card) => (
        <BoardCardButton
          key={card.id}
          card={card}
          selected={selected}
          connecting={connecting}
          dragging={dragging}
          drawOrder={drawOrder}
          beginItemDrag={beginItemDrag}
          cardDrag={cardDrag}
          press={press}
          onCardKeyDown={onCardKeyDown}
        />
      ))}
    </CanvasStage>
  )
}
