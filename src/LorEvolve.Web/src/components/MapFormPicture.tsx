import { formatBytes } from '../lib/bytes'
import { Field } from './Field'
import { MAP_IMAGE_ACCEPT, MAP_IMAGE_MAX_BYTES } from '../maps/api'
import { useI18n } from '../i18n'
import type { RefObject } from 'react'
import type { MapFormProps } from '../maps/mapDraft'
import { QuietNote } from './QuietNote'
import { PictureActions } from './PictureActions'

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
          {/* The shared picker: the input stays reachable but hidden, and a button label stands in for the browser's own. */}
          <PictureActions
            input={mode === 'replace' ? firstInput : undefined}
            accept={MAP_IMAGE_ACCEPT}
            control={control}
            inputId={control.id}
            hasPicture={false}
            busy={false}
            onFile={choose}
            onReframe={() => {}}
            onRemove={() => {}}
            labels={{
              add: t('entity.image.add'),
              replace: t('entity.image.replace'),
              reframe: t('entity.image.editThumbnail'),
              remove: t('entity.image.remove'),
              removing: t('entity.image.removing'),
            }}
            testIds={{
              input: 'map-file-input',
              reframe: 'map-file-reframe',
              remove: 'map-file-remove',
            }}
          />
          {file ? (
            <QuietNote spacing="hint" testId="map-file-chosen">
              {tx('places.mapForm.chosen', {
                name: <bdi>{file.name}</bdi>,
                size: formatBytes(file.size),
              })}
            </QuietNote>
          ) : null}
        </>
      )}
    </Field>
  )
}
