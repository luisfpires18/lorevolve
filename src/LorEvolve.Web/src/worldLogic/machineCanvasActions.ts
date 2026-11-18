import type { Dispatch, KeyboardEvent, MutableRefObject, RefObject, SetStateAction } from 'react'
import { fitView, ZOOM_STEP, type usePanZoom } from '../lib/usePanZoom'
import type { Point } from './machine'
import type { SystemMachineState } from './types'
import type { MachineSelection } from '../components/SystemMachineCanvas'

const PAN_STEP = 48
const MOVE_STEP = 10
const BIG_MOVE_STEP = 50

/** The machine canvas's handlers: pressing a state, dragging a state or its handle, and the canvas's keys. */
export function machineCanvasActions({
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
}: Pick<ReturnType<typeof usePanZoom>, 'view' | 'setView' | 'size' | 'zoomAbout' | 'toLayer'> & {
  connecting: string | null
  onOpen: (selection: NonNullable<MachineSelection>) => void
  onConnectFrom: (stateId: string | null) => void
  onConnect: (fromStateId: string, toStateId: string) => void
  onMove: (stateId: string, x: number, y: number) => void
  stage: RefObject<HTMLDivElement | null>
  dropAt: MutableRefObject<{ id: string; x: number; y: number } | null>
  setDragging: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>
  setPending: Dispatch<SetStateAction<{ from: string; to: Point } | null>>
  items: { x: number; y: number; width: number; height: number }[]
}) {
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

  return { press, stateDrag, handleDrag, onStateKeyDown, onStageKeyDown }
}
