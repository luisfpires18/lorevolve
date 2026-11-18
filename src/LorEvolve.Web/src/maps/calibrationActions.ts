import { ApiError } from '../lib/api'
import { setMapCalibration } from './api'
import type { MapCalibration, MapDetail } from './types'
import { useI18n } from '../i18n'
import type { Fraction } from '../components/MapCalibration'
import type { useCalibrationFormState } from './useCalibrationFormState'

export function calibrationActions({
  universeId,
  map,
  points,
  onPointsChange,
  onSaved,
  a,
  b,
  distance,
  unit,
  setErrors,
  setMessage,
  setIsSaving,
  t,
}: ReturnType<typeof useCalibrationFormState> & {
  universeId: string
  map: MapDetail
  points: Fraction[]
  onPointsChange: (points: Fraction[]) => void
  onSaved: (calibration: MapCalibration) => void
  a: Fraction | null
  b: Fraction | null
  t: ReturnType<typeof useI18n>['t']
}) {
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
  return { setPoint, save }
}
