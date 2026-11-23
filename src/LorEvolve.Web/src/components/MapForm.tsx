import { Drawer } from './Drawer'
import { useI18n } from '../i18n'
import { mapFormActions } from '../maps/mapFormActions'
import { useMapFormState } from '../maps/useMapFormState'
import type { MapFormProps } from '../maps/mapDraft'
import { MAP_NAME_MAX_LENGTH } from '../maps/types'
import { NameNoteFields } from './NameNoteFields'
import { MapFormPicture } from './MapFormPicture'
import { MapFormReplace } from './MapFormReplace'
import { QuietNote } from './QuietNote'

/**
 * Three small forms in the one drawer: a new map (its picture and details in one request), a map's details (saved over
 * the version they were read at, ADR 0043), and a replacement picture with the author's explicit decision about the pins
 * placed on the old one. The picture is chosen with a plain file input: nothing is cropped, nothing is framed - a map
 * is shown whole, so there is nothing to choose but the file.
 */
export function MapForm(props: MapFormProps) {
  const { t } = useI18n()
  const { universeId, onClose, onSaved } = props
  const map = props.mode === 'new' ? null : props.map
  const state = useMapFormState({ props, map })
  const {
    firstInput,
    draft,
    setDraft,
    file,
    pins,
    setPins,
    fieldErrors,
    message,
    isSaving,
    progress,
    isDirty,
  } = state

  const { choose, save } = mapFormActions({ ...state, props, universeId, onSaved, t })

  const heading =
    props.mode === 'new'
      ? t('places.mapForm.headingNew')
      : props.mode === 'details'
        ? t('places.mapForm.headingDetails')
        : t('places.mapForm.headingReplace')
  const pinCount = map?.pins.length ?? 0

  return (
    <Drawer
      initialFocus={firstInput}
      testId="map-form"
      titleId="map-form-heading"
      eyebrow={map ? <bdi>{map.name}</bdi> : null}
      title={heading}
      isDirty={isDirty}
      leaveMessage={
        props.mode === 'new' ? t('places.mapForm.leaveNew') : t('places.mapForm.leaveChanges')
      }
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      message={message}
      messageTestId="map-form-error"
      actions={{
        submitLabel:
          props.mode === 'new'
            ? t('places.mapForm.createMap')
            : props.mode === 'details'
              ? t('places.mapForm.saveDetails')
              : t('places.mapForm.replacePicture'),
        busyLabel: t('places.mapForm.saving'),
        submitTestId: 'map-form-save',
        lockCancel: true,
      }}
    >
      {props.mode !== 'replace' ? (
        <NameNoteFields
          idPrefix="map"
          labels={{ name: t('places.mapForm.name'), note: t('places.mapForm.description') }}
          hint={t('places.mapForm.descriptionHint')}
          rows={3}
          nameMaxLength={MAP_NAME_MAX_LENGTH}
          value={{ name: draft.name, note: draft.description }}
          onChange={(part, value) =>
            setDraft((current) =>
              part === 'name' ? { ...current, name: value } : { ...current, description: value },
            )
          }
          errors={{ name: fieldErrors.name, note: fieldErrors.description }}
          testIds={{ name: 'map-name-input', note: 'map-description-input' }}
          nameRef={firstInput}
        />
      ) : null}

      {props.mode !== 'details' ? (
        <MapFormPicture
          mode={props.mode}
          firstInput={firstInput}
          choose={choose}
          file={file}
          fieldErrors={fieldErrors}
        />
      ) : null}

      {props.mode === 'replace' ? (
        <MapFormReplace
          map={map}
          pinCount={pinCount}
          pins={pins}
          setPins={setPins}
          fieldErrors={fieldErrors}
        />
      ) : null}

      {progress ? (
        <QuietNote spacing="hint" role="status" testId="map-upload-progress">
          {progress.ratio !== null && progress.ratio < 1
            ? t('places.mapForm.uploading', { percent: Math.round(progress.ratio * 100) })
            : t('places.mapForm.uploaded')}
        </QuietNote>
      ) : null}
    </Drawer>
  )
}
