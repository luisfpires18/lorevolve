import { useCallback, useState } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { t } from '../i18n'
import { listValidationTerms } from './api'
import { ValidationTermKind, type ValidationTerm, type ValidationTermKindValue } from './types'

/** The term manager's state, with the effect that reads the universe's event kinds and methods. */
export function useTermManagerState({ universeId }: { universeId: string }) {
  const [terms, setTerms] = useState<ValidationTerm[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{
    id: string
    text: string
    error: string | null
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newKind, setNewKind] = useState<ValidationTermKindValue>(ValidationTermKind.EventKind)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState<string | null>(null)

  // The list is edited in place and a failure shares the manager's message line, so the read writes into this state.
  useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        listValidationTerms(universeId, signal).then(setTerms, () => {
          if (!signal.aborted) setMessage(t('canon.terms.readFailed'))
        }),
      [universeId],
    ),
    { keep: true },
  )

  return {
    terms,
    setTerms,
    message,
    setMessage,
    renaming,
    setRenaming,
    busyId,
    setBusyId,
    newKind,
    setNewKind,
    newName,
    setNewName,
    newError,
    setNewError,
  }
}
