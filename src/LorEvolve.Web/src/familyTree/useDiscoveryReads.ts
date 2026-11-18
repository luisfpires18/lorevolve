import { useEffect } from 'react'
import { listFamilies } from './api'
import type { useDiscoveryState } from './useDiscoveryState'

export function useDiscoveryReads({
  universeId,
  q,
  page,
  reads,
  state,
  setState,
  headingRef,
  focusHeading,
}: ReturnType<typeof useDiscoveryState> & {
  universeId: string
  q: string
  page: number
}) {
  const key = `${q}\u0000${page}\u0000${reads}`

  useEffect(() => {
    const controller = new AbortController()
    listFamilies(universeId, { q, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', key, result }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error', key })
      })
    return () => {
      controller.abort()
    }
  }, [universeId, q, page, key])

  // The answer for another search or page is kept on screen while the next arrives, so the list does not jump.
  const result = state.kind === 'ready' ? state.result : null
  const isCurrent = state.kind !== 'loading' && state.key === key

  useEffect(() => {
    if (isCurrent && focusHeading.current) {
      focusHeading.current = false
      headingRef.current?.focus()
    }
  }, [isCurrent])
  return { key, result, isCurrent }
}
