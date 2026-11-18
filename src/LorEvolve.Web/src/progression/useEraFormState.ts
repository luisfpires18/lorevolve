import { useRef, useState } from 'react'
import type { FieldDefinition } from '../lore/typeDefinitions'
import type { Era, Progression } from './types'
import { draftOf } from './eraDraft'

/** An era drawer's refs and state, with the draft read once from the era. */
export function useEraFormState({
  progression,
  era,
  definitions,
}: {
  progression: Progression
  era: Era | null
  definitions: FieldDefinition[]
}) {
  const nameInput = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const [base, setBase] = useState(progression)
  const [initial] = useState(() => draftOf(era, definitions))
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
