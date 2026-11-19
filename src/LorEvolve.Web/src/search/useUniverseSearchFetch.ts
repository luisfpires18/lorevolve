import { useEffect } from 'react'
import { searchUniverse } from './api'
import type { useUniverseSearchState } from './useUniverseSearchState'
import { useDebouncedValue } from '../lib/useDebouncedValue'

/** Sends the search once typing pauses, aborting the one it replaces. */
export function useUniverseSearchFetch({
  universeId,
  query,
  attempt,
  setSettled,
}: Pick<ReturnType<typeof useUniverseSearchState>, 'query' | 'attempt' | 'setSettled'> & {
  universeId: string
}) {
  const paused = useDebouncedValue(query)
  useEffect(() => {
    // Waits for typing to pause; a cleared box typed back to the same words searches again, as a fresh search should.
    if (paused === '' || paused !== query) return

    const controller = new AbortController()
    searchUniverse(universeId, paused, controller.signal)
      .then((response) => setSettled({ query: paused, kind: 'ready', response }))
      .catch(() => {
        // Replaced by a newer search, or the bar went away: nothing failed.
        if (controller.signal.aborted) return
        setSettled({ query: paused, kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universeId, paused, query, attempt])
}
