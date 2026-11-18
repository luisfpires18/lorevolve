import { useEffect } from 'react'
import { useReturnFocus } from '../lib/returnFocus'
import { Drawer } from './Drawer'
import { useI18n } from '../i18n'
import { mapFormActions } from '../maps/mapFormActions'
import { useMapFormState } from '../maps/useMapFormState'
import type { MapFormProps } from '../maps/mapDraft'
import { MapFormName } from './MapFormName'
import { MapFormPicture } from './MapFormPicture'
import { MapFormReplace } from './MapFormReplace'

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
  useReturnFocus()

  useEffect(() => {
    firstInput.current?.focus()
  }, [])

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
      testId="map-form"
      titleId="map-form-heading"
      eyebrow={map ? <bdi>{map.name}</bdi> : null}
      title={heading}
      isDirty={isDirty}
      leaveMessage={
        props.mode === 'new' ? t('places.mapForm.leaveNew') : t('places.mapForm.leaveChanges')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving || undefined}
            data-testid="map-form-save"
          >
            {isSaving
              ? t('places.mapForm.saving')
              : props.mode === 'new'
                ? t('places.mapForm.createMap')
                : props.mode === 'details'
                  ? t('places.mapForm.saveDetails')
                  : t('places.mapForm.replacePicture')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => close()}
            disabled={isSaving}
          >
            {t('places.mapForm.cancel')}
          </button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="map-form-error">
          {message}
        </p>
      ) : null}

      {props.mode !== 'replace' ? (
        <MapFormName
          firstInput={firstInput}
          draft={draft}
          setDraft={setDraft}
          fieldErrors={fieldErrors}
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
        <p className="field__hint" role="status" data-testid="map-upload-progress">
          {progress.ratio !== null && progress.ratio < 1
            ? t('places.mapForm.uploading', { percent: Math.round(progress.ratio * 100) })
            : t('places.mapForm.uploaded')}
        </p>
      ) : null}
    </Drawer>
  )
}
