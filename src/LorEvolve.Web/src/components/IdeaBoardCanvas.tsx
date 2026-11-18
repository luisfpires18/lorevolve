import { useEffect, useId, useRef, useState, type MutableRefObject } from 'react'
import { readingOrder, type BoardCard, type BoardConnection } from '../ideas/boards'
import type { BoardSelection } from '../ideas/boardSelection'
import { cardKeyDown, stageKeyDown } from '../ideas/boardCanvasKeys'
import { fitView, usePanZoom } from '../lib/usePanZoom'
import { useI18n } from '../i18n'
import { BoardCardButton } from './ideas/BoardCardButton'
import { BoardLines } from './ideas/BoardLines'
import { BoardZoomControls } from './ideas/BoardZoomControls'

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
  const hintId = useId()
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  // The same, for the release to read: a state updater is no place to tell the editor.
  const dropAt = useRef<{ id: string; x: number; y: number } | null>(null)

  const { view, setView, size, zoomAbout, toLayer, beginItemDrag, stageHandlers } = usePanZoom(
    stage,
    {
      limits: () => ({ min: 0.1, max: 3 }),
      initial: (stageSize) => fitView(cards, stageSize),
      onTap: () => onSelect(null),
    },
  )

  useEffect(() => {
    centreRef.current = () => {
      const rect = stage.current!.getBoundingClientRect()
      return toLayer(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
  })

  // A chosen card out of view - just added, or chosen in the list - is brought to the middle of it.
  useEffect(() => {
    if (selected?.kind !== 'card' || size.width === 0) return
    const card = cards.find((each) => each.id === selected.id)
    if (!card) return
    const left = view.x + card.x * view.scale
    const top = view.y + card.y * view.scale
    const inView =
      left >= 0 &&
      top >= 0 &&
      left + card.width * view.scale <= size.width &&
      top + card.height * view.scale <= size.height
    if (inView) return
    setView((current) => ({
      ...current,
      x: size.width / 2 - (card.x + card.width / 2) * current.scale,
      y: size.height / 2 - (card.y + card.height / 2) * current.scale,
    }))
    // Only a new choice moves the view: the author's own panning is never undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function press(card: BoardCard) {
    if (connecting && connecting !== card.id) onConnectTo(card.id)
    else onSelect({ kind: 'card', id: card.id })
  }

  function cardDrag(card: BoardCard) {
    return {
      onMove: (_x: number, _y: number, dx: number, dy: number) => {
        if (readOnly || connecting) return
        dropAt.current = { id: card.id, x: card.x + dx / view.scale, y: card.y + dy / view.scale }
        setDragging(dropAt.current)
      },
      onEnd: (moved: boolean) => {
        const drop = dropAt.current
        dropAt.current = null
        setDragging(null)
        if (moved && drop?.id === card.id) {
          onMoveCard(card.id, drop.x, drop.y)
          onSelect({ kind: 'card', id: card.id })
        } else if (!moved) {
          press(card)
        }
      },
      onCancel: () => {
        dropAt.current = null
        setDragging(null)
      },
    }
  }

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
    <div className="boardcanvas" data-connecting={connecting ? true : undefined}>
      <div
        className="boardcanvas__stage"
        ref={stage}
        role="group"
        aria-label={t('ideas.canvas.board', { title: title || t('ideas.canvas.newBoard') })}
        aria-describedby={hintId}
        tabIndex={0}
        data-testid="board-stage"
        data-scale={view.scale.toFixed(4)}
        {...stageHandlers}
        onKeyDown={onStageKeyDown}
      >
        <div
          className="boardcanvas__layer"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          data-testid="board-layer"
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
        </div>
      </div>

      <BoardZoomControls cards={cards} size={size} setView={setView} zoomAbout={zoomAbout} />

      <p className="visually-hidden" id={hintId}>
        {t('ideas.canvas.hint')}
        {connecting ? ` ${t('ideas.canvas.hintConnecting')}` : ''}
      </p>
    </div>
  )
}
