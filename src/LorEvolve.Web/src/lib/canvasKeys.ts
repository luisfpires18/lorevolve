import { ZOOM_STEP, type usePanZoom, type View } from './usePanZoom'

const PAN_STEP = 48
const MOVE_STEP = 10
const BIG_MOVE_STEP = 50

/**
 * A canvas stage's own keys: the arrows pan, plus and minus zoom about the middle, 0 fits. True when `key` was one.
 * Escape and Enter are each caller's. Used by the idea board, the System machine canvas and the map viewer.
 */
export function panZoomKey(
  key: string,
  {
    size,
    setView,
    zoomAbout,
    fit,
  }: Pick<ReturnType<typeof usePanZoom>, 'size' | 'setView' | 'zoomAbout'> & { fit: () => View },
): boolean {
  const about = { x: size.width / 2, y: size.height / 2 }
  switch (key) {
    case 'ArrowLeft':
      setView((current) => ({ ...current, x: current.x + PAN_STEP }))
      return true
    case 'ArrowRight':
      setView((current) => ({ ...current, x: current.x - PAN_STEP }))
      return true
    case 'ArrowUp':
      setView((current) => ({ ...current, y: current.y + PAN_STEP }))
      return true
    case 'ArrowDown':
      setView((current) => ({ ...current, y: current.y - PAN_STEP }))
      return true
    case '+':
    case '=':
      zoomAbout(ZOOM_STEP, about.x, about.y)
      return true
    case '-':
    case '_':
      zoomAbout(1 / ZOOM_STEP, about.x, about.y)
      return true
    case '0':
      setView(fit())
      return true
    default:
      return false
  }
}

/** How far an arrow key moves the focused card or state: 10, or 50 with Shift. Undefined for any other key. */
export function arrowMove(event: { key: string; shiftKey: boolean }): [number, number] | undefined {
  const step = event.shiftKey ? BIG_MOVE_STEP : MOVE_STEP
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  return moves[event.key]
}
