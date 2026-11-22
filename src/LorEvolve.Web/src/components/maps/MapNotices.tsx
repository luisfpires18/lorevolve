import type { Fraction } from '../MapCalibration'
import type { MapDetail } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { PinForm } from '../../maps/useMapPageState'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { FormMessage } from '../FormMessage'
import { Callout } from '../Callout'

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
        <Callout
          look="callout"
          as="p"
          className="mapscreen__review"
          role="status"
          testId="map-review-notice"
        >
          {tn(
            canEdit ? 'places.mapPage.reviewEditor' : 'places.mapPage.reviewViewer',
            map.pinsAwaitingReview,
            { n: map.pinsAwaitingReview },
          )}
        </Callout>
      ) : null}

      {calibrating ? (
        <Callout
          look="callout"
          as="p"
          className="mapscreen__placing"
          role="status"
          testId="map-calibrating-hint"
        >
          {t('places.mapPage.calibrating')}
        </Callout>
      ) : null}

      {placing ? (
        <Callout
          look="callout"
          as="p"
          className="mapscreen__placing"
          role="status"
          testId="map-placing-hint"
        >
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
          <FormActions onCancel={() => setPlacing(false)} />
        </Callout>
      ) : null}

      {failure ? <FormMessage testId="map-failure">{failure}</FormMessage> : null}
    </>
  )
}
