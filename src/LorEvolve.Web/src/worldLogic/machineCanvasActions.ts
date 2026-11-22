import type { Dispatch, KeyboardEvent, MutableRefObject, RefObject, SetStateAction } from 'react'
import { fitView, type usePanZoom } from '../lib/usePanZoom'
import { arrowMove, panZoomKey } from '../lib/canvasKeys'
import { itemDrag } from '../lib/canvasDrag'
import type { Point } from './machine'
import type { SystemMachineState } from './types'
import type { MachineSelection } from '../components/SystemMachineCanvas'

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
    return itemDrag({
      id: state.id,
      x: state.x,
      y: state.y,
      scale: view.scale,
      dropAt,
      setDragging,
      place: (x, y) => (connecting ? null : { x: Math.round(x), y: Math.round(y) }),
      onDrop: (x, y) => onMove(state.id, x, y),
      onPress: () => press(state),
    })
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
    const move = arrowMove(event)
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
    if (panZoomKey(event.key, { size, setView, zoomAbout, fit: () => fitView(items, size) }))
      event.preventDefault()
  }

  return { press, stateDrag, handleDrag, onStateKeyDown, onStageKeyDown }
}
