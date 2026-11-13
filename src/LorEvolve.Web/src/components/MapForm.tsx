import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { formatBytes } from '../lib/bytes'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import type { UploadProgress } from '../lib/upload'
import {
  createMap,
  MAP_IMAGE_ACCEPT,
  MAP_IMAGE_MAX_BYTES,
  replaceMapImage,
  updateMapDetails,
} from '../maps/api'
import { MAP_NAME_MAX_LENGTH, type MapDetail, type ReplacePinsPolicy } from '../maps/types'
import { useI18n } from '../i18n'

interface MapDraft {
  name: string
  description: string
}

type MapFormProps =
  | { mode: 'new'; universeId: string; onClose: () => void; onSaved: (map: MapDetail) => void }
  | {
      mode: 'details'
      universeId: string
      map: MapDetail
      onClose: () => void
      onSaved: (map: MapDetail) => void
    }
  | {
      mode: 'replace'
      universeId: string
      map: MapDetail
      onClose: () => void
      onSaved: (map: MapDetail) => void
    }

function inputOf(draft: MapDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
  }
}

/**
 * Three small forms in the one drawer: a new map (its picture and details in one request), a map's details (saved over
 * the version they were read at, ADR 0043), and a replacement picture with the author's explicit decision about the pins
 * placed on the old one. The picture is chosen with a plain file input: nothing is cropped, nothing is framed - a map
 * is shown whole, so there is nothing to choose but the file.
 */
export function MapForm(props: MapFormProps) {
  const { t, tn, tx } = useI18n()
  const { universeId, onClose, onSaved } = props
  const map = props.mode === 'new' ? null : props.map
  const dialog = useRef<HTMLDialogElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  const [initial] = useState<MapDraft>(() => ({
    name: map?.name ?? '',
    description: map?.description ?? '',
  }))
  const [draft, setDraft] = useState<MapDraft>(initial)
  const [file, setFile] = useState<File | null>(null)
  const [pins, setPins] = useState<ReplacePinsPolicy | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)

  const isDirty =
    props.mode === 'replace'
      ? file !== null || pins !== null
      : payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial)) || file !== null
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    props.mode === 'new' ? t('places.mapForm.leaveNew') : t('places.mapForm.leaveChanges'),
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    firstInput.current?.focus()
  }, [])

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

    setIsSaving(true)
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
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('places.mapForm.fieldErrors'),
        )
      } else {
        setMessage(t('places.mapForm.failed'))
      }
    } finally {
      setIsSaving(false)
      setProgress(null)
    }
  }

  const heading =
    props.mode === 'new'
      ? t('places.mapForm.headingNew')
      : props.mode === 'details'
        ? t('places.mapForm.headingDetails')
        : t('places.mapForm.headingReplace')
  const pinCount = map?.pins.length ?? 0

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="map-form-heading"
      {...dialogProps}
      data-testid="map-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {map ? (
            <p className="drawer__eyebrow">
              <bdi>{map.name}</bdi>
            </p>
          ) : null}
          <h2 className="drawer__title" id="map-form-heading">
            {heading}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="map-form-error">
              {message}
            </p>
          ) : null}

          {props.mode !== 'replace' ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="map-name">
                  {t('places.mapForm.name')}
                </label>
                <input
                  id="map-name"
                  className="field__input"
                  ref={firstInput}
                  type="text"
                  dir="auto"
                  maxLength={MAP_NAME_MAX_LENGTH}
                  placeholder={t('places.mapForm.namePlaceholder')}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  aria-invalid={fieldErrors.name ? true : undefined}
                  data-testid="map-name-input"
                />
                {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="map-description">
                  {t('places.mapForm.description')}
                </label>
                <p className="field__hint">{t('places.mapForm.descriptionHint')}</p>
                <textarea
                  id="map-description"
                  className="field__input"
                  dir="auto"
                  rows={3}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  aria-invalid={fieldErrors.description ? true : undefined}
                  data-testid="map-description-input"
                />
                {fieldErrors.description ? (
                  <p className="field__error">{fieldErrors.description}</p>
                ) : null}
              </div>
            </>
          ) : null}

          {props.mode !== 'details' ? (
            <div className="field">
              <label className="field__label" htmlFor="map-file">
                {props.mode === 'new'
                  ? t('places.mapForm.imageNew')
                  : t('places.mapForm.imageReplace')}
              </label>
              <p className="field__hint">
                {t('places.mapForm.imageHint', { size: formatBytes(MAP_IMAGE_MAX_BYTES) })}
              </p>
              <input
                id="map-file"
                className="field__input mapform__file"
                ref={props.mode === 'replace' ? firstInput : undefined}
                type="file"
                accept={MAP_IMAGE_ACCEPT}
                onChange={(event) => choose(event.target.files?.[0])}
                aria-invalid={fieldErrors.file ? true : undefined}
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
              {fieldErrors.file ? <p className="field__error">{fieldErrors.file}</p> : null}
            </div>
          ) : null}

          {props.mode === 'replace' ? (
            <fieldset className="field">
              <legend className="field__label">{t('places.mapForm.pinsLegend')}</legend>
              <p className="field__hint">
                {pinCount === 0
                  ? t('places.mapForm.noPins')
                  : tn('places.mapForm.pinsPlaced', pinCount, { n: pinCount })}
              </p>
              {map?.calibration ? (
                <p className="field__hint" data-testid="map-replace-scale-note">
                  {t('places.mapForm.scaleNote')}
                </p>
              ) : null}
              <label className="mapform__choice">
                <input
                  type="radio"
                  name="map-pins"
                  value="keep"
                  checked={pins === 'keep'}
                  onChange={() => setPins('keep')}
                  data-testid="map-replace-keep"
                />
                <span>
                  {tx('places.mapForm.keep', {
                    lead: <strong>{t('places.mapForm.keepLead')}</strong>,
                  })}
                </span>
              </label>
              <label className="mapform__choice">
                <input
                  type="radio"
                  name="map-pins"
                  value="remove"
                  checked={pins === 'remove'}
                  onChange={() => setPins('remove')}
                  data-testid="map-replace-remove"
                />
                <span>
                  {tx('places.mapForm.remove', {
                    lead: <strong>{t('places.mapForm.removeLead')}</strong>,
                  })}
                </span>
              </label>
              {fieldErrors.pins ? <p className="field__error">{fieldErrors.pins}</p> : null}
            </fieldset>
          ) : null}

          {progress ? (
            <p className="field__hint" role="status" data-testid="map-upload-progress">
              {progress.ratio !== null && progress.ratio < 1
                ? t('places.mapForm.uploading', { percent: Math.round(progress.ratio * 100) })
                : t('places.mapForm.uploaded')}
            </p>
          ) : null}
        </div>

        <div className="drawer__actions">
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
            onClick={() => void close()}
            disabled={isSaving}
          >
            {t('places.mapForm.cancel')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
