import { Field } from '../Field'
import { MAP_UNIT_MAX_LENGTH } from '../../maps/types'
import { useI18n } from '../../i18n'
import { PercentField } from '../PercentField'
import { fraction, percent } from '../../maps/calibrationFractions'
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
      {([0, 1] as const).map((index) => {
        const point = index === 0 ? a : b
        const axis = (key: 'x' | 'y', label: string) => ({
          label,
          value: point ? percent(point[key]) : '',
          onChange: (raw: string) => {
            const parsed = fraction(raw)
            setPoint(index, {
              [key]: Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0,
            })
          },
          testId: `map-calibration-${index === 0 ? 'a' : 'b'}-${key}`,
        })
        return (
          <PercentField
            key={index}
            label={
              index === 0
                ? a
                  ? t('places.calibration.pointA')
                  : t('places.calibration.pointANot')
                : b
                  ? t('places.calibration.pointB')
                  : t('places.calibration.pointBNot')
            }
            error={index === 0 ? errors.a : errors.b || errors.x2}
            across={axis('x', t('places.calibration.across'))}
            down={axis('y', t('places.calibration.down'))}
          />
        )
      })}

      <Field
        label={`${t('places.calibration.distance')}, ${t('places.calibration.unit')}`}
        group
        hideLabel
        error={[errors.distance, errors.unit].filter(Boolean).join(' ') || undefined}
      >
        {(group) => (
          <div className="mappinform__coords" {...group}>
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
        )}
      </Field>
    </>
  )
}
