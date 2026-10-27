import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react'

/** Where the layer sits in the stage: scaled by `scale`, its top-left corner at (`x`, `y`) stage pixels. */
export interface View {
  scale: number
  x: number
  y: number
}

export interface StageSize {
  width: number
  height: number
}

/** What an item does while it is dragged through `beginItemDrag`. */
export interface ItemDrag {
  /** The pointer moved past the threshold, or on since. Client coordinates, and the distance from the press. */
  onMove: (clientX: number, clientY: number, dx: number, dy: number) => void
  /** The press ended: `moved` false means it was a press, not a drag. */
  onEnd: (moved: boolean, clientX: number, clientY: number) => void
  /** The drag was taken over by a pinch, or the browser cancelled the pointer. */
  onCancel?: () => void
}

interface PanZoomOptions {
  /** The scale bounds for a stage of this size. */
  limits: (size: StageSize) => { min: number; max: number }
  /** The view to start at, the first time the stage has a size. */
  initial: (size: StageSize) => View
  /** A press on the empty stage that did not move, in client coordinates. */
  onTap?: (clientX: number, clientY: number) => void
}

export const ZOOM_STEP = 1.25
/** A press that moved less than this is a press, not a drag. */
const DRAG_THRESHOLD = 4

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Pan and zoom over one transformed layer, shared by the map viewer (ADR 0060) and the idea board (ADR 0066).
 *
 * The stage is measured as it resizes; the wheel zooms about the pointer; one finger or the mouse pans; two fingers
 * pinch. An item inside the layer - a pin, a card - takes its own press with `beginItemDrag`, so the stage does not pan
 * under it, and a second finger landing turns that press into a pinch. Pointer state is kept in refs: it changes on every
 * move and nothing needs to render for it. Keyboard handling stays with each caller, which knows what its keys mean.
 */
export function usePanZoom(stage: RefObject<HTMLDivElement | null>, options: PanZoomOptions) {
  const latest = useRef(options)
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)

  // What handlers read: the options and view of the last render, never one captured when a press began.
  useLayoutEffect(() => {
    latest.current = options
    viewRef.current = view
  })
  const started = useRef(false)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    kind: 'pan' | 'item' | 'pinch'
    startX: number
    startY: number
    moved: boolean
    view: View
    drag?: ItemDrag
    distance?: number
  } | null>(null)

  // The stage's size, measured as it changes; the first measure places the starting view.
  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      const next = { width: box.width, height: box.height }
      setSize(next)
      if (!started.current && box.width > 0 && box.height > 0) {
        started.current = true
        setView(latest.current.initial(next))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [stage])

  const { min: minScale, max: maxScale } = options.limits(size)

  /** Zooms by `factor` about a stage point, within bounds. */
  const zoomAbout = useCallback(
    (factor: number, aboutX: number, aboutY: number) => {
      setView((current) => {
        const scale = clamp(current.scale * factor, minScale, maxScale)
        const ratio = scale / current.scale
        return {
          scale,
          x: aboutX - (aboutX - current.x) * ratio,
          y: aboutY - (aboutY - current.y) * ratio,
        }
      })
    },
    [minScale, maxScale],
  )

  /** A client point in layer units, under the view as it is now. */
  function toLayer(clientX: number, clientY: number, from: View = viewRef.current) {
    const rect = stage.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - from.x) / from.scale,
      y: (clientY - rect.top - from.y) / from.scale,
    }
  }

  // The wheel zooms the layer, not the page: a listener that may prevent the default, which React's own is not.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    function onWheel(event: globalThis.WheelEvent) {
      event.preventDefault()
      const rect = element!.getBoundingClientRect()
      zoomAbout(
        Math.pow(ZOOM_STEP, -event.deltaY / 100),
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [stage, zoomAbout])

  function track(event: PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    stage.current!.setPointerCapture(event.pointerId)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    track(event)

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current?.drag?.onCancel?.()
      gesture.current = {
        kind: 'pinch',
        startX: (a.x + b.x) / 2,
        startY: (a.y + b.y) / 2,
        moved: true,
        view: viewRef.current,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      }
      return
    }

    if (gesture.current?.kind === 'item') return
    gesture.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      view: viewRef.current,
    }
  }

  /** An item's own press: the stage must not pan under it. Call from the item's `onPointerDown`. */
  function beginItemDrag(event: PointerEvent, drag: ItemDrag) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.stopPropagation()
    track(event)
    gesture.current = {
      kind: 'item',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      view: viewRef.current,
      drag,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || !pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (current.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const rect = stage.current!.getBoundingClientRect()
      const factor = distance / (current.distance || distance)
      const scale = clamp(current.view.scale * factor, minScale, maxScale)
      const ratio = scale / current.view.scale
      const aboutX = current.startX - rect.left
      const aboutY = current.startY - rect.top
      setView({
        scale,
        x: aboutX - (aboutX - current.view.x) * ratio + (midX - current.startX),
        y: aboutY - (aboutY - current.view.y) * ratio + (midY - current.startY),
      })
      return
    }

    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    current.moved = true

    if (current.kind === 'pan') {
      setView({ ...current.view, x: current.view.x + dx, y: current.view.y + dy })
    } else if (current.kind === 'item') {
      current.drag?.onMove(event.clientX, event.clientY, dx, dy)
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    pointers.current.delete(event.pointerId)
    if (stage.current?.hasPointerCapture(event.pointerId))
      stage.current.releasePointerCapture(event.pointerId)
    if (!current) return
    if (current.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    gesture.current = null

    if (current.kind === 'item') {
      current.drag?.onEnd(current.moved, event.clientX, event.clientY)
    } else if (!current.moved) {
      latest.current.onTap?.(event.clientX, event.clientY)
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    gesture.current?.drag?.onCancel?.()
    gesture.current = null
  }

  return {
    view,
    setView,
    size,
    zoomAbout,
    toLayer,
    beginItemDrag,
    stageHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}
