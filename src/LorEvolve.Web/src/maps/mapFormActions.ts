import { formatBytes } from '../lib/bytes'
import { createMap, MAP_IMAGE_MAX_BYTES, replaceMapImage, updateMapDetails } from './api'
import type { MapDetail } from './types'
import { useI18n } from '../i18n'
import { inputOf, type MapFormProps } from './mapDraft'
import type { useMapFormState } from './useMapFormState'

export function mapFormActions({
  props,
  universeId,
  onSaved,
  draft,
  file,
  pins,
  setFile,
  setFieldErrors,
  setMessage,
  form,
  setProgress,
  t,
}: ReturnType<typeof useMapFormState> & {
  props: MapFormProps
  universeId: string
  onSaved: (map: MapDetail) => void
  t: ReturnType<typeof useI18n>['t']
}) {
  function choose(chosen: File | undefined) {
    setFieldErrors((current) => ({ ...current, file: '' }))
    if (!chosen) {
      setFile(null)
      return
    }
    if (chosen.size > MAP_IMAGE_MAX_BYTES) {
      setFile(null)
      setFieldErrors((current) => ({
        ...current,
        file: t('places.mapForm.tooLarge', { size: formatBytes(MAP_IMAGE_MAX_BYTES) }),
      }))
      return
    }
    setFile(chosen)
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    const details = inputOf(draft)

    if (props.mode !== 'replace' && details.name === '') {
      setFieldErrors({ name: t('places.mapForm.nameMissing') })
      return
    }
    if (props.mode !== 'details' && !file) {
      setFieldErrors({ file: t('places.mapForm.fileMissing') })
      return
    }
    if (props.mode === 'replace' && !pins) {
      setFieldErrors({ pins: t('places.mapForm.pinsMissing') })
      return
    }

    await form.save(async () => {
      try {
        const saved =
          props.mode === 'new'
            ? await createMap(universeId, { ...details, file: file! }, setProgress)
            : props.mode === 'details'
              ? await updateMapDetails(universeId, props.map.id, {
                  ...details,
                  expectedVersion: props.map.version,
                })
              : await replaceMapImage(universeId, props.map.id, file!, pins!, setProgress)
        onSaved(saved)
      } finally {
        // Inside the run, so a second save the hook ignores leaves the running upload's progress alone.
        setProgress(null)
      }
    })
  }
  return { choose, save }
}
