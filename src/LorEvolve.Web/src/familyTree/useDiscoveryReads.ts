import { useEffect } from 'react'
import { errorText } from '../lib/errorText'
import { listFamilies } from './api'
import type { useDiscoveryState } from './useDiscoveryState'

export function useDiscoveryReads({
  universeId,
  q,
  page,
  reads,
  state,
  setState,
  answeredKey,
  setAnsweredKey,
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
      .then((value) => {
        setState({ kind: 'ready', value })
        setAnsweredKey(key)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: errorText(error, '') })
        setAnsweredKey(key)
      })
    return () => {
      controller.abort()
    }
  }, [universeId, q, page, key])

  // The answer for another search or page is kept on screen while the next arrives, so the list does not jump.
  const result = state.kind === 'ready' ? state.value : null
  const isCurrent = state.kind !== 'loading' && answeredKey === key

  useEffect(() => {
    if (isCurrent && focusHeading.current) {
      focusHeading.current = false
      headingRef.current?.focus()
    }
  }, [isCurrent])
  return { key, result, isCurrent }
}
