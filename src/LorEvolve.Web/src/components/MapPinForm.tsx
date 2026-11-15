import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { createPin, DUPLICATE_LINK_CODE, updatePin } from '../maps/api'
import {
  MAP_NAME_MAX_LENGTH,
  MAP_NOTE_MAX_LENGTH,
  type MapPin,
  type MapPinInput,
} from '../maps/types'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { useI18n } from '../i18n'

interface PinDraft {
  title: string
  note: string
  /** Shown and typed as percentages of the picture's width and height, from the top-left corner. */
  xPercent: string
  yPercent: string
  lore: EntityChoice | null
}

interface MapPinFormProps {
  universeId: string
  mapId: string
  /** The pin being changed, or null for a new one placed at `at`. */
  pin: MapPin | null
  /** Where a new pin was placed, as fractions. */
  at: { x: number; y: number } | null
  onClose: () => void
  onSaved: (pin: MapPin) => void
}

function percent(fraction: number) {
  return (Math.round(fraction * 10000) / 100).toString()
}

function fraction(text: string) {
  const value = Number.parseFloat(text.replace(',', '.'))
  return Number.isFinite(value) ? value / 100 : Number.NaN
}

function inputOf(draft: PinDraft): MapPinInput {
  return {
    title: draft.title.trim(),
    note: draft.note.trim() === '' ? null : draft.note.trim(),
    x: fraction(draft.xPercent),
    y: fraction(draft.yPercent),
    entityId: draft.lore?.id ?? null,
  }
}

/**
 * A pin's title, note, position and the entry it stands for, in the drawer every LorEvolve form uses. The position is two
 * percentages of the picture - the same fractions the server stores - so a keyboard can place a pin exactly, and so a
 * position the pointer chose can be read and corrected. Choosing an entry fills an empty title with its name; the title
 * stays the author's to change. Saving confirms the position against the picture the map shows now.
 */
export function MapPinForm({ universeId, mapId, pin, at, onClose, onSaved }: MapPinFormProps) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const [initial] = useState<PinDraft>(() => ({
    title: pin?.title ?? '',
    note: pin?.note ?? '',
    xPercent: percent(pin?.x ?? at?.x ?? 0.5),
    yPercent: percent(pin?.y ?? at?.y ?? 0.5),
    lore:
      pin?.lore && !pin.lore.isTrashed && pin.lore.name
        ? { id: pin.lore.id, name: pin.lore.name, typeName: pin.lore.typeName ?? undefined }
        : null,
  }))
  const [draft, setDraft] = useState<PinDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    pin ? t('places.pinForm.leaveChanges', { title: pin.title }) : t('places.pinForm.leaveNew'),
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    titleInput.current?.focus()
  }, [])

  function edit(change: Partial<PinDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})

    const input = inputOf(draft)
    const errors: Record<string, string> = {}
    if (input.title === '') errors.title = t('places.pinForm.titleMissing')
    if (!Number.isFinite(input.x) || input.x < 0 || input.x > 1)
      errors.x = t('places.pinForm.xRange')
    if (!Number.isFinite(input.y) || input.y < 0 || input.y > 1)
      errors.y = t('places.pinForm.yRange')
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSaving(true)
    try {
      const saved = pin
        ? await updatePin(universeId, mapId, pin.id, input)
        : await createPin(universeId, mapId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          error.code === DUPLICATE_LINK_CODE
            ? error.message
            : Object.keys(error.fieldErrors).length === 0
              ? error.message
              : t('places.pinForm.fieldErrors'),
        )
      } else {
        setMessage(t('places.pinForm.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const trashed = pin?.lore?.isTrashed === true

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="map-pin-heading"
      {...dialogProps}
      data-testid="map-pin-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            {pin ? t('places.pinForm.eyebrowEdit') : t('places.pinForm.eyebrowNew')}
          </p>
          <h2 className="drawer__title" id="map-pin-heading">
            {pin ? <bdi>{pin.title}</bdi> : t('places.pinForm.title')}
          </h2>
          {pin && !pin.placedOnCurrentImage ? (
            <p className="drawer__context" data-testid="map-pin-review-note">
              {t('places.pinForm.reviewNote')}
            </p>
          ) : null}
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="map-pin-error">
              {message}
            </p>
          ) : null}

          <EntityPicker
            label={t('places.pinForm.lore')}
            universeId={universeId}
            value={draft.lore}
            onChange={(choice) =>
              setDraft((current) => ({
                ...current,
                lore: choice,
                title: current.title.trim() === '' && choice ? choice.name : current.title,
              }))
            }
            placeholder={t('places.pinForm.lorePlaceholder')}
            error={fieldErrors.entityid}
          />
          <p className="field__hint">
            {trashed ? t('places.pinForm.loreHintTrashed') : t('places.pinForm.loreHint')}
          </p>

          <div className="field">
            <label className="field__label" htmlFor="map-pin-title">
              {t('places.pinForm.titleLabel')}
            </label>
            <input
              id="map-pin-title"
              className="field__input"
              ref={titleInput}
              type="text"
              dir="auto"
              maxLength={MAP_NAME_MAX_LENGTH}
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="map-pin-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="map-pin-note">
              {t('places.pinForm.note')}
            </label>
            <p className="field__hint">{t('places.pinForm.noteHint')}</p>
            <textarea
              id="map-pin-note"
              className="field__input"
              dir="auto"
              rows={3}
              maxLength={MAP_NOTE_MAX_LENGTH}
              value={draft.note}
              onChange={(event) => edit({ note: event.target.value })}
              aria-invalid={fieldErrors.note ? true : undefined}
              data-testid="map-pin-note-input"
            />
            {fieldErrors.note ? <p className="field__error">{fieldErrors.note}</p> : null}
          </div>

          <fieldset className="field mappinform__position">
            <legend className="field__label">{t('places.pinForm.position')}</legend>
            <p className="field__hint">{t('places.pinForm.positionHint')}</p>
            <div className="mappinform__coords">
              <label className="mappinform__coord">
                <span>{t('places.pinForm.across')}</span>
                <input
                  className="field__input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  value={draft.xPercent}
                  onChange={(event) => edit({ xPercent: event.target.value })}
                  aria-invalid={fieldErrors.x ? true : undefined}
                  data-testid="map-pin-x-input"
                />
                <span aria-hidden="true">%</span>
              </label>
              <label className="mappinform__coord">
                <span>{t('places.pinForm.down')}</span>
                <input
                  className="field__input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  value={draft.yPercent}
                  onChange={(event) => edit({ yPercent: event.target.value })}
                  aria-invalid={fieldErrors.y ? true : undefined}
                  data-testid="map-pin-y-input"
                />
                <span aria-hidden="true">%</span>
              </label>
            </div>
            {fieldErrors.x ? <p className="field__error">{fieldErrors.x}</p> : null}
            {fieldErrors.y ? <p className="field__error">{fieldErrors.y}</p> : null}
          </fieldset>
        </div>

        <div className="drawer__actions">
          <button
            className="button"
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving || undefined}
            data-testid="map-pin-save"
          >
            {isSaving
              ? t('places.pinForm.saving')
              : pin
                ? t('places.pinForm.save')
                : t('places.pinForm.place')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void close()}
            disabled={isSaving}
          >
            {t('places.pinForm.cancel')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
