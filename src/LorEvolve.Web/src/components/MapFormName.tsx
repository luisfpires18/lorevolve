import { Field } from './Field'
import { MAP_NAME_MAX_LENGTH } from '../maps/types'
import { useI18n } from '../i18n'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { MapDraft } from '../maps/mapDraft'

export function MapFormName({
  firstInput,
  draft,
  setDraft,
  fieldErrors,
}: {
  firstInput: RefObject<HTMLInputElement | null>
  draft: MapDraft
  setDraft: Dispatch<SetStateAction<MapDraft>>
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()

  return (
    <>
      <Field id="map-name" label={t('places.mapForm.name')} error={fieldErrors.name}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            ref={firstInput}
            type="text"
            dir="auto"
            maxLength={MAP_NAME_MAX_LENGTH}
            placeholder={t('places.mapForm.namePlaceholder')}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            data-testid="map-name-input"
          />
        )}
      </Field>

      <Field
        id="map-description"
        label={t('places.mapForm.description')}
        hint={t('places.mapForm.descriptionHint')}
        error={fieldErrors.description}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input"
            dir="auto"
            rows={3}
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
            data-testid="map-description-input"
          />
        )}
      </Field>
    </>
  )
}
