import { useRef, useState } from 'react'
import { t } from '../i18n'
import { isChangedElsewhere } from '../lib/editConflict'
import { useFormSave } from '../lib/useFormSave'
import type { FieldDefinition } from '../lore/typeDefinitions'
import { PROGRESSION_CHANGED } from './api'
import type { Era, Progression } from './types'
import { draftOf, type EraDraft } from './eraDraft'
import { useDraftForm } from '../lib/useDraftForm'

/** An era drawer's refs and state, with the draft read once from the era. */
export function useEraFormState({
  progression,
  era,
  definitions,
  measure,
}: {
  progression: Progression
  era: Era | null
  definitions: FieldDefinition[]
  /** The draft as the save would send it, for `isDirty`. */
  measure: (draft: EraDraft) => object
}) {
  const nameInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const [base, setBase] = useState(progression)
  const drafted = useDraftForm(() => draftOf(era, definitions), { measure })
  const [conflict, setConflict] = useState(false)
  const form = useFormSave({
    refusal: (error) => {
      if (!isChangedElsewhere(error, PROGRESSION_CHANGED)) return false
      setConflict(true)
      return true
    },
    needChange: () => t('time.eraForm.needChange'),
    failed: () => t('time.eraForm.saveFailed'),
  })

  return {
    nameInput,
    saveButton,
    base,
    setBase,
    ...drafted,
    form,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    isSaving: form.isSaving,
    conflict,
    setConflict,
  }
}
