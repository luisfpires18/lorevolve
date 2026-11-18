import type { Fraction } from '../MapCalibration'
import type { MapDetail } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { PinForm } from '../../maps/useMapPageState'
import { Button } from '../Button'

export function MapNotices({
  map,
  canEdit,
  calibrating,
  placing,
  setPlacing,
  setPinForm,
  failure,
}: {
  map: MapDetail
  canEdit: boolean
  calibrating: Fraction[] | null
  placing: boolean
  setPlacing: Dispatch<SetStateAction<boolean>>
  setPinForm: (form: PinForm | null) => void
  failure: string | null
}) {
  const { t, tn, tx } = useI18n()

  return (
    <>
      {map.pinsAwaitingReview > 0 ? (
        <p className="callout mapscreen__review" role="status" data-testid="map-review-notice">
          {tn(
            canEdit ? 'places.mapPage.reviewEditor' : 'places.mapPage.reviewViewer',
            map.pinsAwaitingReview,
            { n: map.pinsAwaitingReview },
          )}
        </p>
      ) : null}

      {calibrating ? (
        <p className="callout mapscreen__placing" role="status" data-testid="map-calibrating-hint">
          {t('places.mapPage.calibrating')}
        </p>
      ) : null}

      {placing ? (
        <p className="callout mapscreen__placing" role="status" data-testid="map-placing-hint">
          {tx('places.mapPage.placing', {
            position: (
              <Button
                tone="text"
                onClick={() => setPinForm({ kind: 'new', at: { x: 0.5, y: 0.5 } })}
                data-testid="map-place-centre"
              >
                {t('places.mapPage.typePosition')}
              </Button>
            ),
          })}{' '}
          <Button tone="text" onClick={() => setPlacing(false)}>
            {t('places.mapPage.cancel')}
          </Button>
        </p>
      ) : null}

      {failure ? (
        <p className="form__message" role="alert" data-testid="map-failure">
          {failure}
        </p>
      ) : null}
    </>
  )
}
