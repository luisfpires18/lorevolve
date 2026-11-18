import { Field } from '../Field'
import { MAP_UNIT_MAX_LENGTH } from '../../maps/types'
import { useI18n } from '../../i18n'
import { CalibrationCoordinate } from './CalibrationCoordinate'
import type { Fraction } from '../MapCalibration'

export function CalibrationFields({
  a,
  b,
  errors,
  distance,
  unit,
  setDistance,
  setUnit,
  setPoint,
}: {
  a: Fraction | null
  b: Fraction | null
  errors: Record<string, string>
  distance: string
  unit: string
  setDistance: (distance: string) => void
  setUnit: (unit: string) => void
  setPoint: (index: 0 | 1, change: Partial<Fraction>) => void
}) {
  const { t } = useI18n()

  return (
    <>
      <Field
        group="fieldset"
        className="mappinform__position"
        label={a ? t('places.calibration.pointA') : t('places.calibration.pointANot')}
        error={errors.a}
      >
        <div className="mappinform__coords">
          <CalibrationCoordinate
            label={t('places.calibration.across')}
            index={0}
            axis="x"
            value={a}
            setPoint={setPoint}
          />
          <CalibrationCoordinate
            label={t('places.calibration.down')}
            index={0}
            axis="y"
            value={a}
            setPoint={setPoint}
          />
        </div>
      </Field>

      <Field
        group="fieldset"
        className="mappinform__position"
        label={b ? t('places.calibration.pointB') : t('places.calibration.pointBNot')}
        error={errors.b || errors.x2}
      >
        <div className="mappinform__coords">
          <CalibrationCoordinate
            label={t('places.calibration.across')}
            index={1}
            axis="x"
            value={b}
            setPoint={setPoint}
          />
          <CalibrationCoordinate
            label={t('places.calibration.down')}
            index={1}
            axis="y"
            value={b}
            setPoint={setPoint}
          />
        </div>
      </Field>

      <div className="mappinform__coords">
        <label className="mappinform__coord mapcalibration__distance">
          <span>{t('places.calibration.distance')}</span>
          <input
            className="field__input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
            aria-invalid={errors.distance ? true : undefined}
            data-testid="map-calibration-distance"
          />
        </label>
        <label className="mappinform__coord mapcalibration__unit">
          <span>{t('places.calibration.unit')}</span>
          <input
            className="field__input"
            type="text"
            dir="auto"
            maxLength={MAP_UNIT_MAX_LENGTH}
            placeholder={t('places.calibration.unitPlaceholder')}
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            aria-invalid={errors.unit ? true : undefined}
            data-testid="map-calibration-unit"
          />
        </label>
      </div>
      {errors.distance ? <p className="field__error">{errors.distance}</p> : null}
      {errors.unit ? <p className="field__error">{errors.unit}</p> : null}
    </>
  )
}
