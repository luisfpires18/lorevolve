import { formatBytes } from '../lib/bytes'
import { Field } from './Field'
import { MAP_IMAGE_ACCEPT, MAP_IMAGE_MAX_BYTES } from '../maps/api'
import { useI18n } from '../i18n'
import type { RefObject } from 'react'
import type { MapFormProps } from '../maps/mapDraft'

export function MapFormPicture({
  mode,
  firstInput,
  choose,
  file,
  fieldErrors,
}: {
  mode: MapFormProps['mode']
  firstInput: RefObject<HTMLInputElement | null>
  choose: (chosen: File | undefined) => void
  file: File | null
  fieldErrors: Record<string, string>
}) {
  const { t, tx } = useI18n()

  return (
    <Field
      id="map-file"
      label={mode === 'new' ? t('places.mapForm.imageNew') : t('places.mapForm.imageReplace')}
      hint={t('places.mapForm.imageHint', { size: formatBytes(MAP_IMAGE_MAX_BYTES) })}
      error={fieldErrors.file}
    >
      {(control) => (
        <>
          <input
            {...control}
            className="field__input mapform__file"
            ref={mode === 'replace' ? firstInput : undefined}
            type="file"
            accept={MAP_IMAGE_ACCEPT}
            onChange={(event) => choose(event.target.files?.[0])}
            data-testid="map-file-input"
          />
          {file ? (
            <p className="field__hint" data-testid="map-file-chosen">
              {tx('places.mapForm.chosen', {
                name: <bdi>{file.name}</bdi>,
                size: formatBytes(file.size),
              })}
            </p>
          ) : null}
        </>
      )}
    </Field>
  )
}
