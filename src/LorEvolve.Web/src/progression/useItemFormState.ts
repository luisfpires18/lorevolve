import { useRef, useState } from 'react'
import { isChangedElsewhere } from '../lib/editConflict'
import { useFormSave } from '../lib/useFormSave'
import { PROGRESSION_CHANGED } from './api'
import type { Progression } from './types'
import { draftOf, type Item } from './itemDraft'

/** A form, ability or appearance drawer's refs and state, with the draft read once from the item. */
export function useItemFormState({
  progression,
  item,
}: {
  progression: Progression
  item: Item | null
}) {
  const nameInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const [base, setBase] = useState(progression)
  const [initial, setInitial] = useState(() => draftOf(item))
  const [draft, setDraft] = useState(initial)
  const [conflict, setConflict] = useState(false)
  // The words are the kind's and the refused part's: itemFormActions gives them on each save.
  const form = useFormSave({
    refusal: (error) => {
      if (!isChangedElsewhere(error, PROGRESSION_CHANGED)) return false
      setConflict(true)
      return true
    },
    needChange: null,
    failed: '',
  })

  return {
    nameInput,
    saveButton,
    base,
    setBase,
    initial,
    setInitial,
    draft,
    setDraft,
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
