import { Ruler } from 'lucide-react'
import { confirmAction } from '../lib/confirm'
import { removeMapCalibration } from '../maps/api'
import { approximate } from '../maps/format'
import type { MapCalibration, MapDetail } from '../maps/types'
import { useI18n } from '../i18n'
import { calibrationActions } from '../maps/calibrationActions'
import { useCalibrationFormState } from '../maps/useCalibrationFormState'
import { CalibrationFields } from './maps/CalibrationFields'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { SectionTitle } from './Section'

/** A point of the picture, as fractions. */
export interface Fraction {
  x: number
  y: number
}

/**
 * The map's recorded scale, read: how far apart the creator said two points are, and what a pixel is worth. The one place
 * a distance's provenance is shown on screen; nothing here measures anything.
 */
export function MapScaleSummary({
  universeId,
  map,
  canEdit,
  onStartCalibrating,
  onRemoved,
}: {
  universeId: string
  map: MapDetail
  canEdit: boolean
  onStartCalibrating: () => void
  onRemoved: () => void
}) {
  const { t, tx } = useI18n()
  const scale = map.calibration

  async function remove() {
    const confirmed = await confirmAction({
      title: t('places.calibration.removeTitle'),
      message: t('places.calibration.removeMessage'),
      confirmLabel: t('places.calibration.removeConfirm'),
      variant: 'warning',
      action: () => removeMapCalibration(universeId, map.id),
    })
    if (confirmed) onRemoved()
  }

  return (
    <div className="mapscale" data-testid="map-scale">
      <SectionTitle level={2} tone="label">
        {t('places.calibration.scale')}
      </SectionTitle>
      {scale ? (
        <p className="mapscale__text" data-testid="map-scale-text">
          {tx('places.calibration.summary', {
            distance: (
              <strong>
                {approximate(scale.distance)} {scale.unit}
              </strong>
            ),
            perPixel: approximate(scale.unitsPerPixel),
            unit: scale.unit,
          })}
        </p>
      ) : (
        <p className="mapscale__text mapscale__text--none" data-testid="map-scale-none">
          {canEdit ? t('places.calibration.noneEditor') : t('places.calibration.none')}
        </p>
      )}
      {canEdit ? (
        <div className="pincard__actions">
          <Button
            tone="secondary"
            size="sm"
            icon={Ruler}
            onClick={onStartCalibrating}
            data-testid="map-calibrate"
          >
            {scale ? t('places.calibration.setAgain') : t('places.calibration.set')}
          </Button>
          {scale ? (
            <Button
              tone="danger-quiet"
              size="sm"
              onClick={() => void remove()}
              data-testid="map-scale-remove"
            >
              {t('places.calibration.remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Calibrating: two points on the picture - pressed on the map, or typed as percentages - and the fictional distance between
 * them in the creator's own unit. Saved against the picture the map shows now. The unit is a name, never a conversion.
 */
export function MapCalibrationForm({
  universeId,
  map,
  points,
  onPointsChange,
  onSaved,
  onCancel,
}: {
  universeId: string
  map: MapDetail
  points: Fraction[]
  onPointsChange: (points: Fraction[]) => void
  onSaved: (calibration: MapCalibration) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const {
    distance,
    setDistance,
    unit,
    setUnit,
    errors,
    setErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
  } = useCalibrationFormState({ map })

  const a = points[0] ?? null
  const b = points[1] ?? null

  const { setPoint, save } = calibrationActions({
    distance,
    setDistance,
    unit,
    setUnit,
    errors,
    setErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
    universeId,
    map,
    points,
    onPointsChange,
    onSaved,
    a,
    b,
    t,
  })

  return (
    <form
      className="mapcalibration"
      data-testid="map-calibration-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <SectionTitle level={2} tone="label">
        {t('places.calibration.formTitle')}
      </SectionTitle>
      <p className="mapscale__text">{t('places.calibration.formIntro')}</p>
      {message ? (
        <p className="form__message" role="alert" data-testid="map-calibration-error">
          {message}
        </p>
      ) : null}

      <CalibrationFields
        a={a}
        b={b}
        errors={errors}
        distance={distance}
        unit={unit}
        setDistance={setDistance}
        setUnit={setUnit}
        setPoint={setPoint}
      />

      <div className="pincard__actions">
        <FormActions
          submitLabel={t('places.calibration.save')}
          busy={isSaving}
          busyLabel={t('places.calibration.saving')}
          submitTestId="map-calibration-save"
          onCancel={onCancel}
          lockCancel
          size="sm"
        />
      </div>
    </form>
  )
}
