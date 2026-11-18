import type { Fraction } from '../MapCalibration'
import { MapViewer } from '../MapViewer'
import { mapImageUrl } from '../../maps/api'
import type { MapDetail, MapPin } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { PinForm } from '../../maps/useMapPageState'

export function MapStage({
  universe,
  map,
  selectedPinId,
  select,
  focusPinId,
  canEdit,
  placing,
  calibrating,
  setCalibrating,
  setPinForm,
  movePin,
}: {
  universe: WorkspaceContext['universe']
  map: MapDetail
  selectedPinId: string | null
  select: (pinId: string | null, focus?: boolean) => void
  focusPinId: string | null
  canEdit: boolean
  placing: boolean
  calibrating: Fraction[] | null
  setCalibrating: Dispatch<SetStateAction<Fraction[] | null>>
  setPinForm: (form: PinForm | null) => void
  movePin: (pin: MapPin, x: number, y: number) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <MapViewer
      src={mapImageUrl(universe.id, map.id, map.image.assetId, 'display')}
      width={map.image.width}
      height={map.image.height}
      name={map.name}
      pins={map.pins}
      selectedPinId={selectedPinId}
      onSelectPin={(pinId) => select(pinId)}
      focusPinId={focusPinId}
      canEdit={canEdit}
      placing={placing || calibrating !== null}
      onPlace={(x, y) => {
        if (calibrating) {
          // Two points, then the next press starts again from the first.
          setCalibrating(calibrating.length >= 2 ? [{ x, y }] : [...calibrating, { x, y }])
        } else {
          setPinForm({ kind: 'new', at: { x, y } })
        }
      }}
      onMovePin={(pin, x, y) => void movePin(pin, x, y)}
      markers={
        calibrating
          ? calibrating.map((point, index) => ({
              id: index === 0 ? 'a' : 'b',
              x: point.x,
              y: point.y,
              label: index === 0 ? t('places.mapPage.markerA') : t('places.mapPage.markerB'),
            }))
          : map.calibration
            ? [
                {
                  id: 'a',
                  x: map.calibration.x1,
                  y: map.calibration.y1,
                  label: t('places.mapPage.markerA'),
                },
                {
                  id: 'b',
                  x: map.calibration.x2,
                  y: map.calibration.y2,
                  label: t('places.mapPage.markerB'),
                },
              ]
            : []
      }
      overlay={(view) => {
        const line = calibrating
          ? calibrating.length === 2
            ? {
                x1: calibrating[0].x,
                y1: calibrating[0].y,
                x2: calibrating[1].x,
                y2: calibrating[1].y,
              }
            : null
          : map.calibration
            ? {
                x1: map.calibration.x1,
                y1: map.calibration.y1,
                x2: map.calibration.x2,
                y2: map.calibration.y2,
              }
            : null
        if (!line) return null
        return (
          <svg
            className="mapviewer__overlay"
            viewBox={`0 0 ${map.image.width} ${map.image.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
            data-testid="map-scale-line"
          >
            <line
              x1={line.x1 * map.image.width}
              y1={line.y1 * map.image.height}
              x2={line.x2 * map.image.width}
              y2={line.y2 * map.image.height}
              strokeWidth={2 / view.scale}
              strokeDasharray={`${8 / view.scale} ${6 / view.scale}`}
            />
          </svg>
        )
      }}
    />
  )
}
