import { MapScaleSummary, type Fraction } from '../MapCalibration'
import type { MapDetail } from '../../maps/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { LoadState } from '../../maps/useMapPageState'

export function MapPanelActions({
  universe,
  map,
  canEdit,
  setPlacing,
  setCalibrating,
  setState,
}: {
  universe: WorkspaceContext['universe']
  map: MapDetail
  canEdit: boolean
  setPlacing: Dispatch<SetStateAction<boolean>>
  setCalibrating: Dispatch<SetStateAction<Fraction[] | null>>
  setState: Dispatch<SetStateAction<LoadState>>
}) {
  return (
    <MapScaleSummary
      universeId={universe.id}
      map={map}
      canEdit={canEdit}
      onStartCalibrating={() => {
        setPlacing(false)
        setCalibrating(
          map.calibration
            ? [
                { x: map.calibration.x1, y: map.calibration.y1 },
                { x: map.calibration.x2, y: map.calibration.y2 },
              ]
            : [],
        )
      }}
      onRemoved={() => setState({ kind: 'ready', map: { ...map, calibration: null } })}
    />
  )
}
