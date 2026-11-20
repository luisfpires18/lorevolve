import { useRef, useState } from 'react'
import { t } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { useFormSave } from '../lib/useFormSave'
import type { UploadProgress } from '../lib/upload'
import type { MapDetail, ReplacePinsPolicy } from './types'
import { inputOf, type MapDraft, type MapFormProps } from './mapDraft'

export function useMapFormState({ props, map }: { props: MapFormProps; map: MapDetail | null }) {
  const firstInput = useRef<HTMLInputElement>(null)
  const [initial] = useState<MapDraft>(() => ({
    name: map?.name ?? '',
    description: map?.description ?? '',
  }))
  const [draft, setDraft] = useState<MapDraft>(initial)
  const [file, setFile] = useState<File | null>(null)
  const [pins, setPins] = useState<ReplacePinsPolicy | null>(null)
  const form = useFormSave({
    needChange: () => t('places.mapForm.fieldErrors'),
    failed: () => t('places.mapForm.failed'),
  })
  const [progress, setProgress] = useState<UploadProgress | null>(null)

  const isDirty =
    props.mode === 'replace'
      ? file !== null || pins !== null
      : payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial)) || file !== null
  return {
    firstInput,
    draft,
    setDraft,
    file,
    setFile,
    pins,
    setPins,
    form,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    isSaving: form.isSaving,
    progress,
    setProgress,
    isDirty,
  }
}
