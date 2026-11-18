import { useRef, useState } from 'react'
import type { EntityChoice, QuickCreateOptions } from '../components/EntityPicker'

/** Quick Create from a picker: the name its form opened with, the entry it made, and where the focus goes after. */
export function usePickerQuickCreate({
  quickCreate,
  query,
  setQuery,
  setIsOpen,
  value,
  onChange,
}: {
  quickCreate: QuickCreateOptions | null
  query: string
  setQuery: (query: string) => void
  setIsOpen: (isOpen: boolean) => void
  value: EntityChoice | null
  onChange: (choice: EntityChoice | null) => void
}) {
  // The name Quick Create opened with, while its form is open.
  const [creating, setCreating] = useState<string | null>(null)
  // The entry Quick Create just made, said under the choice until the choice changes.
  const [created, setCreated] = useState<EntityChoice | null>(null)
  // Where the focus goes once Quick Create's form has gone: the choice it made, or back to the search.
  const focusAfterCreate = useRef<'chosen' | 'input' | null>(null)

  // Offered whenever something is typed, beside the matches rather than only when there are none: a name can be shared.
  const createName = quickCreate ? query.trim() : ''
  const startCreate = createName
    ? () => {
        setIsOpen(false)
        setCreating(createName)
      }
    : undefined

  function finishCreate(choice: EntityChoice | null, wasCreated: boolean) {
    focusAfterCreate.current = choice ? 'chosen' : 'input'
    setCreating(null)
    if (!choice) return
    setCreated(wasCreated ? choice : null)
    setQuery('')
    onChange(choice)
  }

  const note = created && value?.id === created.id ? created : null

  return { creating, focusAfterCreate, createName, startCreate, finishCreate, note }
}
