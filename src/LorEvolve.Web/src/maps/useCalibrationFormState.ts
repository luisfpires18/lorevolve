import { useState } from 'react'
import type { MapDetail } from './types'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'

export function useCalibrationFormState({ map }: { map: MapDetail }) {
  const [distance, setDistance] = useState(map.calibration ? String(map.calibration.distance) : '')
  const [unit, setUnit] = useState(map.calibration?.unit ?? '')
  const form = useFormSave({
    needChange: () => t('places.calibration.fieldErrors'),
    failed: () => t('places.calibration.failed'),
  })
  return {
    distance,
    setDistance,
    unit,
    setUnit,
    errors: form.fieldErrors,
    setErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    isSaving: form.isSaving,
    runSave: form.save,
  }
}
