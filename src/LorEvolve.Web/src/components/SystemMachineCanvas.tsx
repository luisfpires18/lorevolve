import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react'
import { Maximize, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { fitView, usePanZoom, ZOOM_STEP } from '../lib/usePanZoom'
import { useI18n } from '../i18n'
import {
  edgePoint,
  lineOffsets,
  STATE_HEIGHT,
  STATE_WIDTH,
  type MachineTransition,
  type Point,
} from '../worldLogic/machine'
import type { SystemMachineState } from '../worldLogic/types'

/** What is chosen on the canvas: one state, one transition, or nothing. */
export type MachineSelection =
  { kind: 'state'; id: string } | { kind: 'transition'; id: string } | null

const PAN_STEP = 48
const MOVE_STEP = 10
const BIG_MOVE_STEP = 50

interface SystemMachineCanvasProps {
  name: string
  states: SystemMachineState[]
  transitions: MachineTransition[]
  selected: MachineSelection
  /** The state a transition is being drawn from: the next state pressed is its other end. */
  connecting: string | null
  /** A state or transition pressed: the panel opens it. */
  onOpen: (selection: NonNullable<MachineSelection>) => void
  onConnectFrom: (stateId: string | null) => void
  /** A transition drawn from one state to another, by the handle's drag or by pressing the second state. */
  onConnect: (fromStateId: string, toStateId: string) => void
  /** A state dropped somewhere new, by the pointer or the arrow keys, in canvas units. */
  onMove: (stateId: string, x: number, y: number) => void
  /** Set by the canvas: the canvas point at the centre of the view, where a new state goes. */
  centreRef: MutableRefObject<(() => Point) | null>
}

function rectOf(state: SystemMachineState) {
  return { x: state.x, y: state.y, width: STATE_WIDTH, height: STATE_HEIGHT }
}

function centreOf(state: SystemMachineState) {
  return { x: state.x + STATE_WIDTH / 2, y: state.y + STATE_HEIGHT / 2 }
}

/**
 * A System's machine drawn on the board's canvas (`usePanZoom`, `.boardcanvas`): states are cards, transitions are
 * arrows under them. A state is pressed to open it and dragged to move it; dragging from its handle draws a transition
 * to the state it is dropped on, and pressing the handle starts one that ends at the next state pressed. Each
 * transition's label is a button that opens it. From the keyboard, Tab walks the states in reading order with each
 * state's handle after it, Enter opens or ends a transition, the arrow keys move a state (Shift for bigger steps), and
 * with the canvas itself focused the arrows pan, plus and minus zoom and 0 fits every state. Escape stops drawing.
 */
export function SystemMachineCanvas({
  name,
  states,
  transitions,
  selected,
  connecting,
  onOpen,
  onConnectFrom,
  onConnect,
  onMove,
  centreRef,
}: SystemMachineCanvasProps) {
  const { t } = useI18n()
  const stage = useRef<HTMLDivElement>(null)
  const hintId = useId()
  // An SVG marker is named by url(#id); React's ids carry characters a fragment reference need not accept.
  const headId = `machine-head-${useId().replace(/[^\w-]/g, '')}`
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  // The same, for the release to read: a state updater is no place to tell the panel.
  const dropAt = useRef<{ id: string; x: number; y: number } | null>(null)
  const [pending, setPending] = useState<{ from: string; to: Point } | null>(null)

  const items = states.map(rectOf)
  const { view, setView, size, zoomAbout, toLayer, beginItemDrag, stageHandlers } = usePanZoom(
    stage,
    {
      limits: () => ({ min: 0.1, max: 3 }),
      initial: (stageSize) => fitView(items, stageSize),
      onTap: () => onConnectFrom(null),
    },
  )

  useEffect(() => {
    centreRef.current = () => {
      const rect = stage.current!.getBoundingClientRect()
      return toLayer(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
  })

  // A chosen state out of view, just added or opened from its row, is brought to the middle of it.
  useEffect(() => {
    if (selected?.kind !== 'state' || size.width === 0) return
    const state = states.find((each) => each.id === selected.id)
    if (!state) return
    const left = view.x + state.x * view.scale
    const top = view.y + state.y * view.scale
    const inView =
      left >= 0 &&
      top >= 0 &&
      left + STATE_WIDTH * view.scale <= size.width &&
      top + STATE_HEIGHT * view.scale <= size.height
    if (inView) return
    setView((current) => ({
      ...current,
      x: size.width / 2 - (state.x + STATE_WIDTH / 2) * current.scale,
      y: size.height / 2 - (state.y + STATE_HEIGHT / 2) * current.scale,
    }))
    // Only a new choice moves the view: the author's own panning is never undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  function press(state: SystemMachineState) {
    if (connecting && connecting !== state.id) onConnect(connecting, state.id)
    else onOpen({ kind: 'state', id: state.id })
  }

  function stateDrag(state: SystemMachineState) {
    return {
      onMove: (_x: number, _y: number, dx: number, dy: number) => {
        if (connecting) return
        dropAt.current = {
          id: state.id,
          x: Math.round(state.x + dx / view.scale),
          y: Math.round(state.y + dy / view.scale),
        }
        setDragging(dropAt.current)
      },
      onEnd: (moved: boolean) => {
        const drop = dropAt.current
        dropAt.current = null
        setDragging(null)
        if (moved && drop?.id === state.id) onMove(state.id, drop.x, drop.y)
        else if (!moved) press(state)
      },
      onCancel: () => {
        dropAt.current = null
        setDragging(null)
      },
    }
  }

  function handleDrag(state: SystemMachineState) {
    return {
      onMove: (clientX: number, clientY: number) =>
        setPending({ from: state.id, to: toLayer(clientX, clientY) }),
      onEnd: (moved: boolean, clientX: number, clientY: number) => {
        setPending(null)
        if (!moved) {
          onConnectFrom(connecting === state.id ? null : state.id)
          return
        }
        const target = document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>('[data-state-id]')?.dataset.stateId
        if (target && target !== state.id) onConnect(state.id, target)
      },
      onCancel: () => setPending(null),
    }
  }

  function onStateKeyDown(event: KeyboardEvent<HTMLButtonElement>, state: SystemMachineState) {
    const step = event.shiftKey ? BIG_MOVE_STEP : MOVE_STEP
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      event.stopPropagation()
      onMove(state.id, state.x + move[0], state.y + move[1])
      // Moving a state can move it in the reading order, and so in the page: the focus follows it there.
      requestAnimationFrame(() =>
        stage.current?.querySelector<HTMLElement>(`[data-state-id="${state.id}"]`)?.focus(),
      )
    } else if (event.key === 'Escape' && connecting) {
      event.preventDefault()
      event.stopPropagation()
      onConnectFrom(null)
    }
  }

  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && connecting) {
      event.preventDefault()
      onConnectFrom(null)
      return
    }
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
        setView(fitView(items, size))
        break
      default:
        return
    }
    event.preventDefault()
  }

  const placed = states.map((state) =>
    dragging?.id === state.id ? { ...state, x: dragging.x, y: dragging.y } : state,
  )
  const byId = new Map(placed.map((state) => [state.id, state]))
  const offsets = lineOffsets(transitions)
  const ordered = [...placed].sort((a, b) => a.y - b.y || a.x - b.x)

  const lines = transitions.flatMap((transition) => {
    const from = byId.get(transition.fromStateId)
    const to = byId.get(transition.toStateId)
    if (!from || !to || from.id === to.id) return []
    const a = centreOf(from)
    const b = centreOf(to)
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const offset = offsets.get(transition.id) ?? 0
    // The left-hand normal of this transition's own direction.
    const shift = { x: (-(b.y - a.y) / length) * offset, y: ((b.x - a.x) / length) * offset }
    const a2 = { x: a.x + shift.x, y: a.y + shift.y }
    const b2 = { x: b.x + shift.x, y: b.y + shift.y }
    const start = edgePoint(rectOf(from), a2, b2)
    const end = edgePoint(rectOf(to), b2, a2)
    return [{ transition, start, end, from: from.name, to: to.name }]
  })

  const pendingFrom = pending ? byId.get(pending.from) : undefined

  return (
    <div className="boardcanvas" data-connecting={connecting ? true : undefined}>
      <div
        className="boardcanvas__stage"
        ref={stage}
        role="group"
        aria-label={t('canon.worldLogic.systems.machine.canvas', { name })}
        aria-describedby={hintId}
        tabIndex={0}
        data-testid="machine-stage"
        data-scale={view.scale.toFixed(4)}
        {...stageHandlers}
        onKeyDown={onStageKeyDown}
      >
        <div
          className="boardcanvas__layer"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg className="boardcanvas__lines" width="1" height="1" aria-hidden="true">
            <defs>
              {[false, true].map((isSelected) => (
                <marker
                  key={String(isSelected)}
                  id={isSelected ? `${headId}-selected` : headId}
                  className="machinecanvas__head"
                  data-selected={isSelected || undefined}
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="10"
                  markerHeight="10"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" />
                </marker>
              ))}
            </defs>
            {lines.map(({ transition, start, end }) => {
              const isSelected = selected?.kind === 'transition' && selected.id === transition.id
              return (
                <g
                  key={transition.id}
                  className="boardline"
                  data-selected={isSelected || undefined}
                  data-testid="machine-line"
                  data-transition-id={transition.id}
                  onPointerDown={(event) =>
                    beginItemDrag(event, {
                      onMove: () => {},
                      onEnd: (moved) => {
                        if (!moved) onOpen({ kind: 'transition', id: transition.id })
                      },
                    })
                  }
                >
                  <line
                    className="boardline__hit"
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                  />
                  <line
                    className="boardline__stroke"
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    markerEnd={`url(#${isSelected ? `${headId}-selected` : headId})`}
                  />
                </g>
              )
            })}
            {pendingFrom && pending ? (
              <line
                className="boardline__stroke"
                x1={pendingFrom.x + STATE_WIDTH}
                y1={pendingFrom.y + STATE_HEIGHT / 2}
                x2={pending.to.x}
                y2={pending.to.y}
                strokeDasharray="6 4"
                pointerEvents="none"
                data-testid="machine-pending-line"
              />
            ) : null}
          </svg>

          {ordered.map((state) => {
            const isSelected = selected?.kind === 'state' && selected.id === state.id
            const label = t(
              state.initial
                ? 'canon.worldLogic.systems.machine.stateInitial'
                : 'canon.worldLogic.systems.machine.state',
              { name: state.name, value: state.value },
            )
            return [
              <button
                key={state.id}
                type="button"
                className="boardcard"
                style={{
                  left: `${state.x}px`,
                  top: `${state.y}px`,
                  width: `${STATE_WIDTH}px`,
                  height: `${STATE_HEIGHT}px`,
                }}
                aria-label={label}
                aria-pressed={isSelected}
                data-connecting-from={connecting === state.id || undefined}
                data-dragging={dragging?.id === state.id || undefined}
                data-testid="machine-state"
                data-state-id={state.id}
                data-name={state.name}
                onPointerDown={(event) => beginItemDrag(event, stateDrag(state))}
                onClick={(event) => {
                  // A pointer press is handled on release; the keyboard's Enter and Space land here.
                  if (event.detail === 0) press(state)
                }}
                onKeyDown={(event) => onStateKeyDown(event, state)}
              >
                <span className="boardcard__kind" aria-hidden="true">
                  {state.initial
                    ? `${t('canon.worldLogic.systems.machine.initial')} · ${state.value}`
                    : state.value}
                </span>
                <span className="boardcard__name" aria-hidden="true">
                  <bdi>{state.name}</bdi>
                </span>
              </button>,
              <button
                key={`${state.id}-handle`}
                type="button"
                className="machinecanvas__handle"
                style={{
                  left: `${state.x + STATE_WIDTH - 12}px`,
                  top: `${state.y + STATE_HEIGHT / 2 - 12}px`,
                }}
                aria-label={t('canon.worldLogic.systems.machine.handle', { name: state.name })}
                aria-pressed={connecting === state.id}
                data-connecting-from={connecting === state.id || undefined}
                data-testid="machine-handle"
                data-handle-id={state.id}
                onPointerDown={(event) => beginItemDrag(event, handleDrag(state))}
                onClick={(event) => {
                  if (event.detail === 0) onConnectFrom(connecting === state.id ? null : state.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && connecting) {
                    event.preventDefault()
                    event.stopPropagation()
                    onConnectFrom(null)
                  }
                }}
              >
                <Plus aria-hidden="true" focusable="false" strokeWidth={2} />
              </button>,
            ]
          })}

          {lines.map(({ transition, start, end, from, to }) => {
            const isSelected = selected?.kind === 'transition' && selected.id === transition.id
            const text = transition.label.trim()
            return (
              <button
                key={transition.id}
                type="button"
                className="machinecanvas__label"
                style={{ left: `${(start.x + end.x) / 2}px`, top: `${(start.y + end.y) / 2}px` }}
                aria-label={t('canon.worldLogic.systems.machine.transition', {
                  label: text || t('canon.worldLogic.systems.machine.noLabel'),
                  from,
                  to,
                })}
                aria-pressed={isSelected}
                data-empty={text === '' || undefined}
                data-testid="machine-label"
                data-transition-id={transition.id}
                onPointerDown={(event) =>
                  beginItemDrag(event, {
                    onMove: () => {},
                    onEnd: (moved) => {
                      if (!moved) onOpen({ kind: 'transition', id: transition.id })
                    },
                  })
                }
                onClick={(event) => {
                  if (event.detail === 0) onOpen({ kind: 'transition', id: transition.id })
                }}
              >
                <bdi>{text || t('canon.worldLogic.systems.machine.noLabel')}</bdi>
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="mapviewer__controls boardcanvas__controls"
        role="group"
        aria-label={t('canon.worldLogic.systems.machine.zoom')}
      >
        <button
          className="iconbutton"
          type="button"
          aria-label={t('canon.worldLogic.systems.machine.zoomIn')}
          title={t('canon.worldLogic.systems.machine.zoomIn')}
          onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="machine-zoom-in"
        >
          <ZoomIn aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label={t('canon.worldLogic.systems.machine.zoomOut')}
          title={t('canon.worldLogic.systems.machine.zoomOut')}
          onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="machine-zoom-out"
        >
          <ZoomOut aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label={t('canon.worldLogic.systems.machine.fit')}
          title={t('canon.worldLogic.systems.machine.fit')}
          onClick={() => setView(fitView(items, size))}
          data-testid="machine-fit"
        >
          <Maximize aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
      </div>

      <p className="visually-hidden" id={hintId}>
        {t('canon.worldLogic.systems.machine.hint')}
        {connecting ? ` ${t('canon.worldLogic.systems.machine.hintConnecting')}` : ''}
      </p>
    </div>
  )
}
