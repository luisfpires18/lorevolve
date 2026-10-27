import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import {
  BOARD_CARD_KIND_LABELS,
  BoardCardKind,
  cardName,
  readingOrder,
  type BoardCard,
  type BoardConnection,
} from '../ideas/boards'
import { usePanZoom, ZOOM_STEP, type StageSize, type View } from '../lib/usePanZoom'

/** What is chosen on a board: one card, one line, or nothing. */
export type BoardSelection = { kind: 'card'; id: string } | { kind: 'line'; id: string } | null

const PAN_STEP = 48
const MOVE_STEP = 10
const BIG_MOVE_STEP = 50
const FIT_MARGIN = 48

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

function fitView(cards: BoardCard[], size: StageSize): View {
  if (cards.length === 0) return { scale: 1, x: size.width / 2, y: size.height / 2 }
  const left = Math.min(...cards.map((card) => card.x))
  const top = Math.min(...cards.map((card) => card.y))
  const right = Math.max(...cards.map((card) => card.x + card.width))
  const bottom = Math.max(...cards.map((card) => card.y + card.height))
  const scale = Math.min(
    1,
    (size.width - FIT_MARGIN * 2) / Math.max(right - left, 1),
    (size.height - FIT_MARGIN * 2) / Math.max(bottom - top, 1),
  )
  return {
    scale: Math.max(scale, 0.1),
    x: size.width / 2 - ((left + right) / 2) * scale,
    y: size.height / 2 - ((top + bottom) / 2) * scale,
  }
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
        aria-label={`Board: ${title || 'New board'}`}
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
          <svg className="boardcanvas__lines" width="1" height="1" aria-hidden="true">
            {connections.map((line) => {
              const from = byId.get(line.fromCardId)
              const to = byId.get(line.toCardId)
              if (!from || !to) return null
              const x1 = from.x + from.width / 2
              const y1 = from.y + from.height / 2
              const x2 = to.x + to.width / 2
              const y2 = to.y + to.height / 2
              const isSelected = selected?.kind === 'line' && selected.id === line.id
              return (
                <g
                  key={line.id}
                  className="boardline"
                  data-selected={isSelected || undefined}
                  data-testid="board-line"
                  data-line-id={line.id}
                  onPointerDown={(event) =>
                    beginItemDrag(event, {
                      onMove: () => {},
                      onEnd: (moved) => {
                        if (!moved) onSelect({ kind: 'line', id: line.id })
                      },
                    })
                  }
                >
                  <line className="boardline__hit" x1={x1} y1={y1} x2={x2} y2={y2} />
                  <line className="boardline__stroke" x1={x1} y1={y1} x2={x2} y2={y2} />
                  {line.label ? (
                    <text className="boardline__label" x={(x1 + x2) / 2} y={(y1 + y2) / 2}>
                      {line.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>

          {readingOrder(placed).map((card) => {
            const isSelected = selected?.kind === 'card' && selected.id === card.id
            const name = cardName(card)
            const kind = BOARD_CARD_KIND_LABELS[card.kind]
            return (
              <button
                key={card.id}
                type="button"
                className="boardcard"
                style={{
                  left: `${card.x}px`,
                  top: `${card.y}px`,
                  width: `${card.width}px`,
                  height: `${card.height}px`,
                  zIndex: drawOrder.get(card.id),
                }}
                aria-label={`${kind}: ${name}${card.isGone ? ' (gone)' : ''}`}
                aria-pressed={isSelected}
                data-kind={kind.toLowerCase()}
                data-gone={card.isGone || undefined}
                data-connecting-from={connecting === card.id || undefined}
                data-dragging={dragging?.id === card.id || undefined}
                data-testid="board-card"
                data-card-id={card.id}
                data-name={name}
                onPointerDown={(event) => beginItemDrag(event, cardDrag(card))}
                onClick={(event) => {
                  // A pointer press is handled on release; the keyboard's Enter and Space land here.
                  if (event.detail === 0) press(card)
                }}
                onKeyDown={(event) => onCardKeyDown(event, card)}
              >
                <span className="boardcard__kind" aria-hidden="true">
                  {card.kind === BoardCardKind.Entity && card.entityTypeName
                    ? card.entityTypeName
                    : kind}
                </span>
                {card.kind === BoardCardKind.Note ? (
                  <span className="boardcard__text" aria-hidden="true">
                    {card.text || <span className="boardcard__empty">Empty note</span>}
                  </span>
                ) : (
                  <>
                    <span className="boardcard__name" aria-hidden="true">
                      <bdi>{name}</bdi>
                    </span>
                    {card.excerpt ? (
                      <span className="boardcard__excerpt" aria-hidden="true">
                        {card.excerpt}
                      </span>
                    ) : null}
                  </>
                )}
                {card.isGone ? (
                  <span className="boardcard__gone" aria-hidden="true">
                    {card.kind === BoardCardKind.Idea ? 'Deleted idea' : 'In the Trash'}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mapviewer__controls boardcanvas__controls" role="group" aria-label="Zoom">
        <button
          className="iconbutton"
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="board-zoom-in"
        >
          <ZoomIn aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="board-zoom-out"
        >
          <ZoomOut aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label="Fit every card in view"
          title="Fit every card in view"
          onClick={() => setView(fitView(cards, size))}
          data-testid="board-fit"
        >
          <Maximize aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
      </div>

      <p className="visually-hidden" id={hintId}>
        Drag to pan and scroll to zoom. With the board focused, the arrow keys pan, plus and minus
        zoom, and 0 fits every card. Tab reaches each card; Enter chooses it, and the arrow keys
        move it.
        {connecting ? ' Drawing a line: choose the card it ends at, or press Escape.' : ''}
      </p>
    </div>
  )
}
