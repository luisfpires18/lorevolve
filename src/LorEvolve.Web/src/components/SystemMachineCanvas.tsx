import { useId, useRef, useState, type MutableRefObject } from 'react'
import { fitView, usePanZoom } from '../lib/usePanZoom'
import { useI18n } from '../i18n'
import {
  edgePoint,
  lineOffsets,
  STATE_HEIGHT,
  STATE_WIDTH,
  type MachineTransition,
  type Point,
} from '../worldLogic/machine'
import type { GuardMarkValue } from '../worldLogic/markText'
import type { SystemMachineState } from '../worldLogic/types'
import { machineCanvasActions } from '../worldLogic/machineCanvasActions'
import { MachineLines } from './worldLogic/MachineLines'
import { MachineStateCard } from './worldLogic/MachineStateCard'
import { MachineLineLabel } from './worldLogic/MachineLineLabel'
import { CanvasStage } from './CanvasStage'

/** What is chosen on the canvas: one state, one transition, or nothing. */
export type MachineSelection =
  { kind: 'state'; id: string } | { kind: 'transition'; id: string } | null

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
  /** Each state's open and reviewing findings, as the server last counted them. */
  counts: Map<string, number>
  /** Each transition's mark for the entry being tried; empty when none is. */
  marks: Map<string, GuardMarkValue>
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
  counts,
  marks,
}: SystemMachineCanvasProps) {
  const { t } = useI18n()
  const stage = useRef<HTMLDivElement>(null)
  // An SVG marker is named by url(#id); React's ids carry characters a fragment reference need not accept.
  const headId = `machine-head-${useId().replace(/[^\w-]/g, '')}`
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  // The same, for the release to read: a state updater is no place to tell the panel.
  const dropAt = useRef<{ id: string; x: number; y: number } | null>(null)
  const [pending, setPending] = useState<{ from: string; to: Point } | null>(null)

  const items = states.map(rectOf)
  const panZoom = usePanZoom(stage, {
    limits: () => ({ min: 0.1, max: 3 }),
    initial: (stageSize) => fitView(items, stageSize),
    onTap: () => onConnectFrom(null),
  })
  const { view, setView, size, zoomAbout, toLayer, beginItemDrag } = panZoom

  const chosen =
    selected?.kind === 'state' ? states.find((each) => each.id === selected.id) : undefined

  // The handlers read `stage` and `dropAt` on a press, a drag or a key, never during render.
  // oxlint-disable-next-line react/refs
  const { press, stateDrag, handleDrag, onStateKeyDown, onStageKeyDown } = machineCanvasActions({
    connecting,
    onOpen,
    onConnectFrom,
    onConnect,
    onMove,
    stage,
    dropAt,
    setDragging,
    setPending,
    view,
    setView,
    size,
    zoomAbout,
    toLayer,
    items,
  })

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
    <CanvasStage
      stage={stage}
      panZoom={panZoom}
      items={items}
      label={t('canon.worldLogic.systems.machine.canvas', { name })}
      testId="machine"
      connecting={connecting}
      onKeyDown={onStageKeyDown}
      fitLabel={t('canon.worldLogic.systems.machine.fit')}
      hint={t('canon.worldLogic.systems.machine.hint')}
      hintConnecting={t('canon.worldLogic.systems.machine.hintConnecting')}
      centreRef={centreRef}
      focus={chosen && rectOf(chosen)}
      focusOn={selected}
    >
      <MachineLines
        headId={headId}
        lines={lines}
        selected={selected}
        beginItemDrag={beginItemDrag}
        onOpen={onOpen}
        pendingFrom={pendingFrom}
        pending={pending}
      />

      {ordered.map((state) => (
        <MachineStateCard
          key={state.id}
          state={state}
          selected={selected}
          connecting={connecting}
          dragging={dragging}
          counts={counts}
          beginItemDrag={beginItemDrag}
          stateDrag={stateDrag}
          handleDrag={handleDrag}
          press={press}
          onStateKeyDown={onStateKeyDown}
          onConnectFrom={onConnectFrom}
        />
      ))}

      {lines.map(({ transition, start, end, from, to }) => (
        <MachineLineLabel
          key={transition.id}
          transition={transition}
          start={start}
          end={end}
          from={from}
          to={to}
          selected={selected}
          marks={marks}
          beginItemDrag={beginItemDrag}
          onOpen={onOpen}
        />
      ))}
    </CanvasStage>
  )
}
