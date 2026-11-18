import type { ReactNode } from 'react'
import type { MapPin } from '../../maps/types'
import { usePanZoom, type View } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'
import type { CSSProperties } from 'react'
import type { MapMarker } from '../MapViewer'
import type { mapViewerActions } from '../../maps/mapViewerActions'

export function MapViewerLayer({
  layerStyle,
  src,
  name,
  width,
  height,
  markers,
  pins,
  dragging,
  selectedPinId,
  beginItemDrag,
  pinDrag,
  onSelectPin,
  overlay,
  view,
  size,
}: {
  layerStyle: CSSProperties
  src: string
  name: string
  width: number
  height: number
  markers: MapMarker[]
  pins: MapPin[]
  dragging: { id: string; x: number; y: number } | null
  selectedPinId: string | null
  beginItemDrag: ReturnType<typeof usePanZoom>['beginItemDrag']
  pinDrag: ReturnType<typeof mapViewerActions>['pinDrag']
  onSelectPin: (pinId: string | null) => void
  overlay?: (view: View, size: { width: number; height: number }) => ReactNode
  view: View
  size: { width: number; height: number }
}) {
  const { t } = useI18n()

  return (
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
              pin.placedOnCurrentImage
                ? pin.title
                : t('places.viewer.pinReview', { title: pin.title })
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
  )
}
