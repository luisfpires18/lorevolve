import { useState } from 'react'
import { Ruler } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { removeMapCalibration, setMapCalibration } from '../maps/api'
import { approximate } from '../maps/format'
import { MAP_UNIT_MAX_LENGTH, type MapCalibration, type MapDetail } from '../maps/types'
import { useI18n } from '../i18n'

/** A point of the picture, as fractions. */
export interface Fraction {
  x: number
  y: number
}

function percent(fraction: number) {
  return (Math.round(fraction * 10000) / 100).toString()
}

function fraction(text: string) {
  const value = Number.parseFloat(text.replace(',', '.'))
  return Number.isFinite(value) ? value / 100 : Number.NaN
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
      <h2 className="mapscreen__pinsheading">{t('places.calibration.scale')}</h2>
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
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={onStartCalibrating}
            data-testid="map-calibrate"
          >
            <ActionIcon icon={Ruler} />
            {scale ? t('places.calibration.setAgain') : t('places.calibration.set')}
          </button>
          {scale ? (
            <button
              className="button button--secondary button--sm button--danger-quiet"
              type="button"
              onClick={() => void remove()}
              data-testid="map-scale-remove"
            >
              {t('places.calibration.remove')}
            </button>
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
  const [distance, setDistance] = useState(map.calibration ? String(map.calibration.distance) : '')
  const [unit, setUnit] = useState(map.calibration?.unit ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const a = points[0] ?? null
  const b = points[1] ?? null

  function setPoint(index: 0 | 1, change: Partial<Fraction>) {
    const next = [...points]
    const current = next[index] ?? { x: 0.5, y: 0.5 }
    next[index] = { ...current, ...change }
    if (index === 1 && !next[0]) next[0] = { x: 0.5, y: 0.5 }
    onPointsChange(next)
  }

  async function save() {
    setMessage(null)
    const problems: Record<string, string> = {}
    if (!a) problems.a = t('places.calibration.firstMissing')
    if (!b) problems.b = t('places.calibration.secondMissing')
    const value = Number.parseFloat(distance.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0)
      problems.distance = t('places.calibration.distanceInvalid')
    if (unit.trim() === '') problems.unit = t('places.calibration.unitMissing')
    if (Object.keys(problems).length > 0) {
      setErrors(problems)
      return
    }

    setErrors({})
    setIsSaving(true)
    try {
      onSaved(
        await setMapCalibration(universeId, map.id, {
          x1: a!.x,
          y1: a!.y,
          x2: b!.x,
          y2: b!.y,
          distance: value,
          unit: unit.trim(),
        }),
      )
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('places.calibration.fieldErrors'),
        )
      } else {
        setMessage(t('places.calibration.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  function coordinate(label: string, index: 0 | 1, axis: 'x' | 'y', value: Fraction | null) {
    return (
      <label className="mappinform__coord">
        <span>{label}</span>
        <input
          className="field__input"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.01}
          value={value ? percent(value[axis]) : ''}
          onChange={(event) => {
            const parsed = fraction(event.target.value)
            setPoint(index, {
              [axis]: Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0,
            })
          }}
          data-testid={`map-calibration-${index === 0 ? 'a' : 'b'}-${axis}`}
        />
        <span aria-hidden="true">%</span>
      </label>
    )
  }

  return (
    <form
      className="mapcalibration"
      data-testid="map-calibration-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 className="mapscreen__pinsheading">{t('places.calibration.formTitle')}</h2>
      <p className="mapscale__text">{t('places.calibration.formIntro')}</p>
      {message ? (
        <p className="form__message" role="alert" data-testid="map-calibration-error">
          {message}
        </p>
      ) : null}

      <fieldset className="field mappinform__position">
        <legend className="field__label">
          {a ? t('places.calibration.pointA') : t('places.calibration.pointANot')}
        </legend>
        <div className="mappinform__coords">
          {coordinate(t('places.calibration.across'), 0, 'x', a)}
          {coordinate(t('places.calibration.down'), 0, 'y', a)}
        </div>
        {errors.a ? <p className="field__error">{errors.a}</p> : null}
      </fieldset>

      <fieldset className="field mappinform__position">
        <legend className="field__label">
          {b ? t('places.calibration.pointB') : t('places.calibration.pointBNot')}
        </legend>
        <div className="mappinform__coords">
          {coordinate(t('places.calibration.across'), 1, 'x', b)}
          {coordinate(t('places.calibration.down'), 1, 'y', b)}
        </div>
        {errors.b || errors.x2 ? <p className="field__error">{errors.b ?? errors.x2}</p> : null}
      </fieldset>

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

      <div className="pincard__actions">
        <button
          className="button button--sm"
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving || undefined}
          data-testid="map-calibration-save"
        >
          {isSaving ? t('places.calibration.saving') : t('places.calibration.save')}
        </button>
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={onCancel}
          disabled={isSaving}
        >
          {t('places.calibration.cancel')}
        </button>
      </div>
    </form>
  )
}
