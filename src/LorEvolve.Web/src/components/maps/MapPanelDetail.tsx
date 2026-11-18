import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from '../ActionIcon'
import { MapCalibrationForm, type Fraction } from '../MapCalibration'
import { TypeIcon } from '../TypeIcon'
import type { MapDetail, MapPin } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { LoadState, PinForm } from '../../maps/useMapPageState'

export function MapPanelDetail({
  universe,
  map,
  calibrating,
  setCalibrating,
  setState,
  selected,
  canEdit,
  setPinForm,
  removePin,
}: {
  universe: WorkspaceContext['universe']
  map: MapDetail
  calibrating: Fraction[] | null
  setCalibrating: Dispatch<SetStateAction<Fraction[] | null>>
  setState: Dispatch<SetStateAction<LoadState>>
  selected: MapPin | null
  canEdit: boolean
  setPinForm: (form: PinForm | null) => void
  removePin: (pin: MapPin) => Promise<void>
}) {
  const { t, tx } = useI18n()

  return (
    <>
      {calibrating ? (
        <MapCalibrationForm
          universeId={universe.id}
          map={map}
          points={calibrating}
          onPointsChange={setCalibrating}
          onSaved={(calibration) => {
            setCalibrating(null)
            setState({ kind: 'ready', map: { ...map, calibration } })
          }}
          onCancel={() => setCalibrating(null)}
        />
      ) : null}

      {selected && !calibrating ? (
        <div className="pincard" data-testid="map-pin-card">
          <h2 className="pincard__title">
            <bdi>{selected.title}</bdi>
          </h2>
          {!selected.placedOnCurrentImage ? (
            <p className="pincard__review" data-testid="map-pin-card-review">
              {t('places.mapPage.pinReview')}
            </p>
          ) : null}
          {selected.note ? (
            <p className="pincard__note" dir="auto" data-testid="map-pin-card-note">
              {selected.note}
            </p>
          ) : null}
          {selected.lore ? (
            selected.lore.isTrashed || !selected.lore.name ? (
              <p
                className="pincard__lore pincard__lore--trashed"
                data-testid="map-pin-card-trashed"
              >
                {t('places.mapPage.pinTrashed')}
              </p>
            ) : (
              <Link
                className="pincard__lore"
                to={`/app/universes/${universe.id}/lore/${selected.lore.id}`}
                data-testid="map-pin-open-entry"
              >
                <TypeIcon iconKey={selected.lore.typeIcon} className="pincard__icon" />
                <span>
                  {tx('places.mapPage.openEntry', { name: <bdi>{selected.lore.name}</bdi> })}
                  <span className="pincard__type">
                    {' '}
                    {t('places.mapPage.entryType', { type: selected.lore.typeName ?? '' })}
                  </span>
                </span>
              </Link>
            )
          ) : (
            <p className="pincard__lore pincard__lore--none">{t('places.mapPage.annotation')}</p>
          )}
          <p className="pincard__position">
            {t('places.mapPage.position', {
              x: (selected.x * 100).toFixed(1),
              y: (selected.y * 100).toFixed(1),
            })}
          </p>
          {canEdit ? (
            <div className="pincard__actions">
              <button
                className="button button--secondary button--sm"
                type="button"
                onClick={() => setPinForm({ kind: 'edit', pin: selected })}
                data-testid="map-pin-edit"
              >
                <ActionIcon icon={Pencil} />
                {t('places.mapPage.editPin')}
              </button>
              <button
                className="button button--secondary button--sm button--danger-quiet"
                type="button"
                onClick={() => void removePin(selected)}
                data-testid="map-pin-remove"
              >
                <ActionIcon icon={Trash2} />
                {t('places.mapPage.removePin')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
