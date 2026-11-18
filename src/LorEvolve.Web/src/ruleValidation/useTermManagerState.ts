import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const controller = new AbortController()
    listValidationTerms(universeId, controller.signal)
      .then(setTerms)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('canon.terms.readFailed'))
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

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
