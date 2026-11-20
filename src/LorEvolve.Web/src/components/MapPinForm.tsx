import { QuietNote } from './QuietNote'
import { useRef, useState } from 'react'
import { payloadKey } from '../lib/drawerGuard'
import { useFormSave } from '../lib/useFormSave'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { PercentField } from './PercentField'
import { createPin, DUPLICATE_LINK_CODE, updatePin } from '../maps/api'
import {
  MAP_NAME_MAX_LENGTH,
  MAP_NOTE_MAX_LENGTH,
  type MapPin,
  type MapPinInput,
} from '../maps/types'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { useI18n } from '../i18n'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'

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
  const form = useFormSave({
    needChange: (_fieldErrors, error) =>
      error.code === DUPLICATE_LINK_CODE ? error.message : t('places.pinForm.fieldErrors'),
    failed: t('places.pinForm.failed'),
  })
  const { fieldErrors, setFieldErrors, setMessage, message, isSaving } = form

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))

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

    await form.save(async () => {
      const saved = pin
        ? await updatePin(universeId, mapId, pin.id, input)
        : await createPin(universeId, mapId, input)
      onSaved(saved)
    })
  }

  const trashed = pin?.lore?.isTrashed === true

  return (
    <Drawer
      initialFocus={titleInput}
      testId="map-pin-form"
      titleId="map-pin-heading"
      eyebrow={pin ? t('places.pinForm.eyebrowEdit') : t('places.pinForm.eyebrowNew')}
      title={pin ? <bdi>{pin.title}</bdi> : t('places.pinForm.title')}
      context={
        pin && !pin.placedOnCurrentImage ? (
          <QuietNote size="ui" wrap className="drawer__context" testId="map-pin-review-note">
            {t('places.pinForm.reviewNote')}
          </QuietNote>
        ) : null
      }
      isDirty={isDirty}
      leaveMessage={
        pin ? t('places.pinForm.leaveChanges', { title: pin.title }) : t('places.pinForm.leaveNew')
      }
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={pin ? t('places.pinForm.save') : t('places.pinForm.place')}
          busy={isSaving}
          busyLabel={t('places.pinForm.saving')}
          submitTestId="map-pin-save"
          onCancel={() => close()}
          lockCancel
        />
      )}
    >
      {message ? <FormMessage testId="map-pin-error">{message}</FormMessage> : null}

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

      <Field id="map-pin-title" label={t('places.pinForm.titleLabel')} error={fieldErrors.title}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            ref={titleInput}
            type="text"
            dir="auto"
            maxLength={MAP_NAME_MAX_LENGTH}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            data-testid="map-pin-title-input"
          />
        )}
      </Field>

      <Field
        as="textarea"
        id="map-pin-note"
        label={t('places.pinForm.note')}
        hint={t('places.pinForm.noteHint')}
        error={fieldErrors.note}
        dir="auto"
        rows={3}
        maxLength={MAP_NOTE_MAX_LENGTH}
        value={draft.note}
        onChange={(event) => edit({ note: event.target.value })}
        data-testid="map-pin-note-input"
      />

      <PercentField
        label={t('places.pinForm.position')}
        hint={t('places.pinForm.positionHint')}
        error={[fieldErrors.x, fieldErrors.y].filter(Boolean).join(' ') || undefined}
        across={{
          label: t('places.pinForm.across'),
          value: draft.xPercent,
          onChange: (xPercent) => edit({ xPercent }),
          invalid: Boolean(fieldErrors.x),
          testId: 'map-pin-x-input',
        }}
        down={{
          label: t('places.pinForm.down'),
          value: draft.yPercent,
          onChange: (yPercent) => edit({ yPercent }),
          invalid: Boolean(fieldErrors.y),
          testId: 'map-pin-y-input',
        }}
      />
    </Drawer>
  )
}
