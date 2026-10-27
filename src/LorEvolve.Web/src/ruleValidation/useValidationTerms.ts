import { useCallback, useEffect, useState } from 'react'
import { listValidationTerms } from './api'
import type { ValidationTerm } from './types'

/**
 * The universe's event kinds and methods for one form: read once when it opens, and grown in place when the author adds a term
 * from the form itself, so a new term can be chosen without reading the list again.
 */
export function useValidationTerms(universeId: string) {
  const [terms, setTerms] = useState<ValidationTerm[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listValidationTerms(universeId, controller.signal)
      .then(setTerms)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [universeId, reads])

  const add = useCallback((term: ValidationTerm) => {
    setTerms((current) => (current ? [...current, term] : [term]))
  }, [])

  const reload = useCallback(() => {
    setFailed(false)
    setReads((count) => count + 1)
  }, [])

  return { terms, failed, add, reload }
}
