import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { MapPin } from '../maps/types'

/** Where the picture sits in the stage: scaled by `scale`, its top-left corner at (`x`, `y`) stage pixels. */
interface View {
  scale: number
  x: number
  y: number
}

/** A marker that is not a pin - a calibration point (#53) - drawn the same way, at a fraction of the picture. */
export interface MapMarker {
  id: string
  x: number
  y: number
  label: string
}

interface MapViewerProps {
  /** The display copy's address: the fitted WebP, drawn stretched to the original's displayed size. */
  src: string
  /** The original's displayed size, the space every fraction is measured against. */
  width: number
  height: number
  /** The map's name, which names the picture and the stage. */
  name: string
  pins: MapPin[]
  selectedPinId: string | null
  onSelectPin: (pinId: string | null) => void
  /** A pin to centre the view on when this changes: the deep link's pin, or the one chosen in the list. */
  focusPinId: string | null
  /** Whether pins may be dragged to a new place, and whether a press on the map may place one. */
  canEdit: boolean
  /** Placing mode: the next press on the picture reports its fractions instead of panning or selecting. */
  placing: boolean
  onPlace?: (x: number, y: number) => void
  onMovePin?: (pin: MapPin, x: number, y: number) => void
  markers?: MapMarker[]
  /** Drawn inside the stage, over the picture: a calibration line (#53). Receives the current view. */
  overlay?: (view: View, size: { width: number; height: number }) => ReactNode
}

const ZOOM_STEP = 1.25
const PAN_STEP = 48
/** A press that moved less than this is a press, not a drag. */
const DRAG_THRESHOLD = 4

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * The map: one picture panned and zoomed with the pointer, the wheel, two fingers or the keyboard, with pins drawn at
 * fractions of it so they stay put at every zoom and on every screen (ADR 0060).
 *
 * Built on a CSS transform rather than a map library: the one layer holds the picture at its displayed size and every
 * pin at `left: x%; top: y%`, and the layer is translated and scaled as a whole. Pins are real buttons - in the tab
 * order, named, pressable - counter-scaled so they keep one size however far in the picture is zoomed. Leaflet with
 * `CRS.Simple` was weighed (BSD-2, healthy, ~42 KB gzipped plus its stylesheet): it draws markers as its own DOM
 * outside React, its keyboard handling stops at the map, and its icon assets fight the bundler. Nothing here needs a
 * canvas or a tile pyramid; a picture, a transform and some buttons are the whole requirement.
 *
 * Keyboard: with the stage focused, arrows pan, `+`/`-` zoom, `0` fits the whole map; in placing mode Enter places a
 * pin at the centre of the view. Tab reaches each pin in turn; Enter or Space selects it. Touch: one finger pans, two
 * pinch; `touch-action: none` keeps the page from scrolling under a drag.
 */
export function MapViewer({
  src,
  width,
  height,
  name,
  pins,
  selectedPinId,
  onSelectPin,
  focusPinId,
  canEdit,
  placing,
  onPlace,
  onMovePin,
  markers = [],
  overlay,
}: MapViewerProps) {
  const stage = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const fitted = useRef(false)
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)

  // Pointer gestures, kept in refs: they change on every move and nothing needs to render for them.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    kind: 'pan' | 'pin' | 'pinch'
    startX: number
    startY: number
    moved: boolean
    view: View
    pin?: MapPin
    distance?: number
  } | null>(null)

  const fitScale =
    size.width > 0 && size.height > 0 ? Math.min(size.width / width, size.height / height) : 1
  const minScale = fitScale / 2
  const maxScale = Math.max(fitScale * 8, 2)

  const fit = useCallback(
    (stageWidth: number, stageHeight: number): View => {
      const scale = Math.min(stageWidth / width, stageHeight / height)
      return {
        scale,
        x: (stageWidth - width * scale) / 2,
        y: (stageHeight - height * scale) / 2,
      }
    },
    [width, height],
  )

  // The stage's size, measured as it changes; the first measure fits the whole map in it.
  useLayoutEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box) return
      setSize({ width: box.width, height: box.height })
      if (!fitted.current && box.width > 0 && box.height > 0) {
        fitted.current = true
        setView(fit(box.width, box.height))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [fit])

  // A new picture: fit again.
  useEffect(() => {
    fitted.current = false
    if (size.width > 0 && size.height > 0) {
      fitted.current = true
      setView(fit(size.width, size.height))
    }
    // The size is read, not depended on: resizing must not refit a view the author has moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fit])

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

  // The pin to focus - from the address, or chosen in the list - brought to the centre, zoomed in enough to see.
  useEffect(() => {
    if (!focusPinId || size.width === 0) return
    const pin = pins.find((each) => each.id === focusPinId)
    if (!pin) return
    setView((current) => {
      const scale = clamp(Math.max(current.scale, fitScale * 2.5), minScale, maxScale)
      return {
        scale,
        x: size.width / 2 - pin.x * width * scale,
        y: size.height / 2 - pin.y * height * scale,
      }
    })
    // Only the chosen pin triggers this; the pins list and size are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, size.width === 0])

  /** A stage point as fractions of the picture, clamped onto it. */
  function fractionAt(clientX: number, clientY: number, from: View = view) {
    const rect = stage.current!.getBoundingClientRect()
    const x = (clientX - rect.left - from.x) / (width * from.scale)
    const y = (clientY - rect.top - from.y) / (height * from.scale)
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
  }

  // The wheel zooms the map, not the page: a listener that may prevent the default, which React's own is not.
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
  }, [zoomAbout])

  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    stage.current!.setPointerCapture(event.pointerId)

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        kind: 'pinch',
        startX: (a.x + b.x) / 2,
        startY: (a.y + b.y) / 2,
        moved: true,
        view,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      }
      return
    }

    if (gesture.current?.kind === 'pin') return
    gesture.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      view,
    }
  }

  function onPinPointerDown(event: PointerEvent<HTMLButtonElement>, pin: MapPin) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    // The press is the pin's: the stage must not start panning under it. Released without moving it selects the pin;
    // dragged, and only for someone who may edit, it moves the pin.
    event.stopPropagation()
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    stage.current!.setPointerCapture(event.pointerId)
    gesture.current = {
      kind: 'pin',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      view,
      pin,
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
    } else if (current.kind === 'pin' && current.pin && canEdit && !placing) {
      const at = fractionAt(event.clientX, event.clientY)
      setDragging({ id: current.pin.id, x: at.x, y: at.y })
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

    if (current.kind === 'pin' && current.pin) {
      if (current.moved && canEdit && !placing) {
        const at = fractionAt(event.clientX, event.clientY)
        setDragging(null)
        onMovePin?.(current.pin, at.x, at.y)
      } else {
        // A press always selects; the empty map or Escape clears. Never a toggle, so a press is never a surprise.
        onSelectPin(current.pin.id)
      }
      return
    }

    // A press that did not move: place a pin, or clear the selection.
    if (!current.moved) {
      if (placing && onPlace) {
        const at = fractionAt(event.clientX, event.clientY)
        onPlace(at.x, at.y)
      } else {
        onSelectPin(null)
      }
    }
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    gesture.current = null
    setDragging(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
        setView(fit(size.width, size.height))
        break
      case 'Escape':
        if (!selectedPinId) return
        onSelectPin(null)
        break
      case 'Enter':
        if (placing && onPlace) {
          const rect = stage.current!.getBoundingClientRect()
          const at = fractionAt(rect.left + about.x, rect.top + about.y)
          onPlace(at.x, at.y)
          break
        }
        return
      default:
        return
    }
    event.preventDefault()
  }

  const layerStyle = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
    ['--map-scale' as string]: String(view.scale),
  }

  return (
    <div className="mapviewer" data-testid="map-viewer" data-placing={placing || undefined}>
      <div
        className="mapviewer__stage"
        ref={stage}
        role="group"
        aria-label={`Map: ${name}`}
        aria-describedby={hintId}
        tabIndex={0}
        data-testid="map-stage"
        data-scale={view.scale.toFixed(4)}
        onPointerDown={onStagePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <div className="mapviewer__layer" style={layerStyle} data-testid="map-layer">
          <img
            className="mapviewer__image"
            src={src}
            alt={name}
            width={width}
            height={height}
            draggable={false}
            decoding="async"
          />
          {markers.map((marker) => (
            <span
              className="mapmarker"
              key={marker.id}
              style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
              data-testid="map-marker"
            >
              <span className="mapmarker__dot" aria-hidden="true" />
              <span className="mapmarker__label">{marker.label}</span>
            </span>
          ))}
          {pins.map((pin) => {
            const at = dragging?.id === pin.id ? dragging : pin
            const selected = pin.id === selectedPinId
            return (
              <button
                className="mappin"
                key={pin.id}
                type="button"
                style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
                aria-label={
                  pin.placedOnCurrentImage ? pin.title : `${pin.title} (position awaiting review)`
                }
                aria-pressed={selected}
                data-testid="map-pin"
                data-pin-id={pin.id}
                data-pin-title={pin.title}
                data-review={pin.placedOnCurrentImage ? undefined : true}
                data-dragging={dragging?.id === pin.id || undefined}
                onPointerDown={(event) => onPinPointerDown(event, pin)}
                onClick={(event) => {
                  // A pointer press is handled on release above; the keyboard's Enter and Space land here.
                  if (event.detail === 0) onSelectPin(pin.id)
                }}
              >
                <span className="mappin__head" aria-hidden="true" />
                <span className="mappin__label" aria-hidden="true">
                  <bdi>{pin.title}</bdi>
                </span>
              </button>
            )
          })}
          {overlay?.(view, size)}
        </div>
      </div>

      <div className="mapviewer__controls" role="group" aria-label="Zoom">
        <button
          className="iconbutton"
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-in"
        >
          <ZoomIn aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-out"
        >
          <ZoomOut aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label="Fit the whole map"
          title="Fit the whole map"
          onClick={() => setView(fit(size.width, size.height))}
          data-testid="map-fit"
        >
          <Maximize aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
      </div>

      <p className="visually-hidden" id={hintId}>
        Drag to pan and scroll to zoom. With the map focused, the arrow keys pan, plus and minus
        zoom, and 0 fits the whole map. Tab reaches each pin; Enter selects it.
        {placing
          ? ' Placing a pin: press the map where it goes, or press Enter to place it at the centre.'
          : ''}
      </p>
    </div>
  )
}
