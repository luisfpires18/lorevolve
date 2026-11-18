import { useRef, useState } from 'react'
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)

  return {
    nameInput,
    saveButton,
    base,
    setBase,
    initial,
    setInitial,
    draft,
    setDraft,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
    conflict,
    setConflict,
  }
}
