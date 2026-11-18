import { useEffect } from 'react'
import { searchUniverse } from './api'
import type { useUniverseSearchState } from './useUniverseSearchState'

/** How long typing has to pause before a search is sent. Short enough to feel immediate, long enough not to send every key. */
const DEBOUNCE_MS = 200

/** Sends the search once typing pauses, aborting the one it replaces. */
export function useUniverseSearchFetch({
  universeId,
  query,
  attempt,
  setSettled,
}: Pick<ReturnType<typeof useUniverseSearchState>, 'query' | 'attempt' | 'setSettled'> & {
  universeId: string
}) {
  useEffect(() => {
    if (query === '') return

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchUniverse(universeId, query, controller.signal)
        .then((response) => setSettled({ query, kind: 'ready', response }))
        .catch(() => {
          // Replaced by a newer search, or the bar went away: nothing failed.
          if (controller.signal.aborted) return
          setSettled({ query, kind: 'error' })
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, query, attempt])
}
