import {
  useEffect,
  useId,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react'
import { fitView, type usePanZoom } from '../lib/usePanZoom'
import { ZoomControls } from './ZoomControls'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The stage of a pan and zoom canvas of cards and lines (#456): the idea board and the System machine draw it. The
 * root, the focusable stage with `usePanZoom`'s handlers, the transformed layer holding `children`, the zoom group and
 * the hint. It sets `centreRef` to the canvas point at the middle of the view, and brings `focus` (the chosen card's
 * rect in canvas units) to the middle when a new `focusOn` leaves it out of view.
 */
export function CanvasStage({
  stage,
  panZoom,
  items,
  label,
  testId,
  layerTestId,
  connecting,
  onKeyDown,
  fitLabel,
  hint,
  hintConnecting,
  centreRef,
  focus,
  focusOn,
  children,
}: {
  /** The caller's ref, the one it gave `usePanZoom`. */
  stage: RefObject<HTMLDivElement | null>
  panZoom: ReturnType<typeof usePanZoom>
  /** What fit shows. */
  items: Rect[]
  label: string
  /** The prefix: the stage is `${testId}-stage`, and the zoom buttons' ids start with it. */
  testId: string
  layerTestId?: string
  connecting: string | null
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  fitLabel: string
  hint: string
  hintConnecting: string
  centreRef: MutableRefObject<(() => { x: number; y: number }) | null>
  focus: Rect | undefined
  /** The selection: only a new one may move the view. */
  focusOn: unknown
  children: ReactNode
}) {
  const { view, setView, size, zoomAbout, toLayer, stageHandlers } = panZoom
  const hintId = useId()

  useEffect(() => {
    centreRef.current = () => {
      const rect = stage.current!.getBoundingClientRect()
      return toLayer(rect.left + rect.width / 2, rect.top + rect.height / 2)
    }
  })

  // A chosen card out of view - just added, or chosen in the list - is brought to the middle of it.
  useEffect(() => {
    if (!focus || size.width === 0) return
    const left = view.x + focus.x * view.scale
    const top = view.y + focus.y * view.scale
    const inView =
      left >= 0 &&
      top >= 0 &&
      left + focus.width * view.scale <= size.width &&
      top + focus.height * view.scale <= size.height
    if (inView) return
    setView((current) => ({
      ...current,
      x: size.width / 2 - (focus.x + focus.width / 2) * current.scale,
      y: size.height / 2 - (focus.y + focus.height / 2) * current.scale,
    }))
    // Only a new choice moves the view: the author's own panning is never undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOn])

  return (
    <div className="boardcanvas" data-connecting={connecting ? true : undefined}>
      <div
        className="boardcanvas__stage"
        ref={stage}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        data-testid={`${testId}-stage`}
        data-scale={view.scale.toFixed(4)}
        {...stageHandlers}
        onKeyDown={onKeyDown}
      >
        <div
          className="boardcanvas__layer"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          data-testid={layerTestId}
        >
          {children}
        </div>
      </div>

      <ZoomControls
        look="board"
        zoomAbout={zoomAbout}
        size={size}
        onFit={() => setView(fitView(items, size))}
        fitLabel={fitLabel}
        testId={testId}
      />

      <p className="visually-hidden" id={hintId}>
        {hint}
        {connecting ? ` ${hintConnecting}` : ''}
      </p>
    </div>
  )
}

/** One line on the stage, pressed to choose it: a wide hit line under the drawn stroke (#456). */
export function CanvasLine({
  x1,
  y1,
  x2,
  y2,
  selected,
  testId,
  data,
  beginItemDrag,
  onPress,
  markerEnd,
  children,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  selected: boolean
  testId: string
  /** The line's id attribute, such as `{ 'data-line-id': id }`. */
  data: Record<`data-${string}`, string>
  beginItemDrag: ReturnType<typeof usePanZoom>['beginItemDrag']
  /** A press that did not move. */
  onPress: () => void
  /** The stroke's arrowhead. */
  markerEnd?: string
  /** Drawn after the stroke, inside the group: a label. */
  children?: ReactNode
}) {
  return (
    <g
      className="boardline"
      data-selected={selected || undefined}
      data-testid={testId}
      {...data}
      onPointerDown={(event) =>
        beginItemDrag(event, {
          onMove: () => {},
          onEnd: (moved) => {
            if (!moved) onPress()
          },
        })
      }
    >
      <line className="boardline__hit" x1={x1} y1={y1} x2={x2} y2={y2} />
      <line className="boardline__stroke" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={markerEnd} />
      {children}
    </g>
  )
}
