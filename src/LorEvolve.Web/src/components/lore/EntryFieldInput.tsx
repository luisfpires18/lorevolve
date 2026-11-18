import { FieldInput } from '../FieldInputs'
import { emptyValue } from '../../lore/document'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { useI18n } from '../../i18n'
import { heldReference } from '../../lore/entryChanges'
import type { EntryFormProps } from './EntryForm'

/** One field's control in the form, with the refusal under it; `data-field-id` is where a refused save sends the focus. */
export function EntryFieldInput({
  definition,
  draft,
  universe,
  entityId,
  detail,
  source,
  chronology,
  quickCreate,
  setDraft,
  isNew,
  pendingFieldImages,
  setPendingFieldImages,
  setDetail,
  isSaving,
  typeChanged,
  fieldErrors,
}: EntryFormProps & { definition: FieldDefinition; typeChanged: boolean }) {
  const { t } = useI18n()
  return (
    <div data-field-id={definition.id}>
      <FieldInput
        definition={definition}
        value={draft.fields[definition.id] ?? emptyValue(definition)}
        universeId={universe.id}
        excludeId={entityId}
        heldReference={heldReference(detail ?? source?.detail ?? null, definition.id)}
        chronology={chronology}
        quickCreate={quickCreate}
        onChange={(next) =>
          setDraft((current) =>
            current
              ? { ...current, fields: { ...current.fields, [definition.id]: next } }
              : current,
          )
        }
        image={{
          entityId: isNew ? null : (entityId ?? null),
          stored: detail?.fieldImages.find((one) => one.fieldId === definition.id) ?? null,
          pending: pendingFieldImages[definition.id] ?? null,
          onPending: (held) =>
            setPendingFieldImages((current) => {
              const { [definition.id]: _dropped, ...rest } = current
              return held ? { ...rest, [definition.id]: held } : rest
            }),
          onChanged: (picture) =>
            setDetail((current) =>
              current
                ? {
                    ...current,
                    fieldImages: [
                      ...current.fieldImages.filter((one) => one.fieldId !== definition.id),
                      ...(picture ? [picture] : []),
                    ],
                  }
                : current,
            ),
          // The picture belongs to the entry's saved type: none is created or changed while a type change is unsaved.
          disabled: isSaving || typeChanged,
          disabledHint: typeChanged ? t('entity.fieldImage.saveTypeFirst') : undefined,
        }}
      />
      {fieldErrors[definition.id] ? (
        <p className="field__error">{fieldErrors[definition.id]}</p>
      ) : null}
    </div>
  )
}
