import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import type { FieldDefinition } from '../lore/typeDefinitions'
import { eraInputOf, PROGRESSION_CHANGED, saveProgression } from './api'
import type { Era, Progression } from './types'
import { inputOf, type EraDraft, type FieldDraft } from './eraDraft'
import type { useEraFormState } from './useEraFormState'

/** An era drawer's handlers: editing the draft and its fields, and Save. */
export function eraFormActions({
  universeId,
  entityId,
  definitions,
  era,
  onSaved,
  reckonsInEras,
  custom,
  base,
  draft,
  setDraft,
  setFieldErrors,
  setMessage,
  setIsSaving,
  setConflict,
}: ReturnType<typeof useEraFormState> & {
  universeId: string
  entityId: string
  definitions: FieldDefinition[]
  era: Era | null
  onSaved: (progression: Progression) => void
  reckonsInEras: boolean
  custom: boolean
}) {
  function edit(change: Partial<EraDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function editField(id: string, change: Partial<FieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: { ...current.fields, [id]: { ...current.fields[id], ...change } },
    }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const shown = new Set(definitions.map((definition) => definition.id))
    const typed = inputOf(draft, era?.id ?? null, reckonsInEras, custom)
    // An override of a field this form does not show - the type's fields could not be read, say - goes back exactly as it
    // was read: what the form cannot show, it never clears.
    const kept = era
      ? eraInputOf(era).fields.filter((field) => !shown.has(field.fieldDefinitionId))
      : []
    const mine = { ...typed, fields: [...kept, ...typed.fields] }
    const eras = base.eras.map((one) => (one.id === era?.id ? mine : eraInputOf(one)))

    try {
      const saved = await saveProgression(universeId, entityId, {
        eras: era && eras.some((one) => one.id === era.id) ? eras : [...eras, mine],
        expectedVersion: base.version,
      })
      onSaved(saved)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('time.eraForm.needChange'),
        )
      } else {
        setMessage(t('time.eraForm.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { edit, editField, save }
}
