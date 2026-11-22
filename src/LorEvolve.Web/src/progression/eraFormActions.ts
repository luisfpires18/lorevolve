import type { FieldDefinition } from '../lore/typeDefinitions'
import { eraInputOf, saveProgression } from './api'
import type { Era, Progression } from './types'
import { inputOf, type FieldDraft } from './eraDraft'
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
  edit,
  form,
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
  function editField(id: string, change: Partial<FieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: { ...current.fields, [id]: { ...current.fields[id], ...change } },
    }))
  }

  async function save() {
    const shown = new Set(definitions.map((definition) => definition.id))
    const typed = inputOf(draft, era?.id ?? null, reckonsInEras, custom)
    // An override of a field this form does not show - the type's fields could not be read, say - goes back exactly as it
    // was read: what the form cannot show, it never clears.
    const kept = era
      ? eraInputOf(era).fields.filter((field) => !shown.has(field.fieldDefinitionId))
      : []
    const mine = { ...typed, fields: [...kept, ...typed.fields] }
    const eras = base.eras.map((one) => (one.id === era?.id ? mine : eraInputOf(one)))

    await form.save(async () => {
      setConflict(false)
      const saved = await saveProgression(universeId, entityId, {
        eras: era && eras.some((one) => one.id === era.id) ? eras : [...eras, mine],
        expectedVersion: base.version,
      })
      onSaved(saved)
    })
  }

  return { edit, editField, save }
}
