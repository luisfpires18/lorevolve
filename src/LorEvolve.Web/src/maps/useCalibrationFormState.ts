import { useState } from 'react'
import type { MapDetail } from './types'

export function useCalibrationFormState({ map }: { map: MapDetail }) {
  const [distance, setDistance] = useState(map.calibration ? String(map.calibration.distance) : '')
  const [unit, setUnit] = useState(map.calibration?.unit ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  return {
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
  }
}
