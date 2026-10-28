import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { MapPin } from '../maps/types'
import { clamp, usePanZoom, ZOOM_STEP, type StageSize, type View } from '../lib/usePanZoom'

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

const PAN_STEP = 48

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
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)

  const fitScaleFor = (stageSize: StageSize) =>
    stageSize.width > 0 && stageSize.height > 0
      ? Math.min(stageSize.width / width, stageSize.height / height)
      : 1

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

  const { view, setView, size, zoomAbout, toLayer, beginItemDrag, stageHandlers } = usePanZoom(
    stage,
    {
      limits: (stageSize) => {
        const fitted = fitScaleFor(stageSize)
        return { min: fitted / 2, max: Math.max(fitted * 8, 2) }
      },
      initial: (stageSize) => fit(stageSize.width, stageSize.height),
      // A press that did not move: place a pin, or clear the selection.
      onTap: (clientX, clientY) => {
        if (placing && onPlace) {
          const at = fractionAt(clientX, clientY)
          onPlace(at.x, at.y)
        } else {
          onSelectPin(null)
        }
      },
    },
  )

  const fitScale = fitScaleFor(size)
  const minScale = fitScale / 2
  const maxScale = Math.max(fitScale * 8, 2)

  // A new picture: fit again. The first fit is the hook's, once the stage has a size.
  useEffect(() => {
    if (size.width > 0 && size.height > 0) setView(fit(size.width, size.height))
    // The size is read, not depended on: resizing must not refit a view the author has moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fit])

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

  /** A client point as fractions of the picture, clamped onto it. */
  function fractionAt(clientX: number, clientY: number) {
    const at = toLayer(clientX, clientY)
    return { x: clamp(at.x / width, 0, 1), y: clamp(at.y / height, 0, 1) }
  }

  /**
   * The press is the pin's: released without moving it selects the pin; dragged, and only for someone who may edit, it
   * moves the pin.
   */
  function pinDrag(pin: MapPin) {
    return {
      onMove: (clientX: number, clientY: number) => {
        if (canEdit && !placing) setDragging({ id: pin.id, ...fractionAt(clientX, clientY) })
      },
      onEnd: (moved: boolean, clientX: number, clientY: number) => {
        if (moved && canEdit && !placing) {
          const at = fractionAt(clientX, clientY)
          setDragging(null)
          onMovePin?.(pin, at.x, at.y)
        } else {
          // A press always selects; the empty map or Escape clears. Never a toggle, so a press is never a surprise.
          onSelectPin(pin.id)
        }
      },
      onCancel: () => setDragging(null),
    }
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
        {...stageHandlers}
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
                onPointerDown={(event) => beginItemDrag(event, pinDrag(pin))}
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
