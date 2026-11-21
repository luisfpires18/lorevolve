import { useCallback, useState } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { listValidationTerms } from './api'
import type { ValidationTerm } from './types'

/**
 * The universe's event kinds and methods for one form: read once when it opens, and grown in place when the author adds a term
 * from the form itself, so a new term can be chosen without reading the list again.
 */
export function useValidationTerms(universeId: string) {
  const [terms, setTerms] = useState<ValidationTerm[] | null>(null)
  const [failed, setFailed] = useState(false)

  // A read again keeps the terms already read beside its failure, so the read writes into this state.
  const { refresh } = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        listValidationTerms(universeId, signal).then(setTerms, () => {
          if (!signal.aborted) setFailed(true)
        }),
      [universeId],
    ),
    { keep: true },
  )

  const add = useCallback((term: ValidationTerm) => {
    setTerms((current) => (current ? [...current, term] : [term]))
  }, [])

  const reload = useCallback(() => {
    setFailed(false)
    refresh()
  }, [refresh])

  return { terms, failed, add, reload }
}
