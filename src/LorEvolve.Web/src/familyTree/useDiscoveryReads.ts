import { useCallback, useEffect } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { listFamilies } from './api'
import type { useDiscoveryState } from './useDiscoveryState'

export function useDiscoveryReads({
  universeId,
  q,
  page,
  reads,
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

  // Retry is a new key, so it reads again without saying loading; any failure says so.
  const { load: state } = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        listFamilies(universeId, { q, page }, signal).then(
          (value) => {
            setAnsweredKey(key)
            return value
          },
          (error: unknown) => {
            if (!signal.aborted) setAnsweredKey(key)
            throw error
          },
        ),
      [universeId, q, page, key, setAnsweredKey],
    ),
    { keep: true, keepOnFailure: false },
  )

  // The answer for another search or page is kept on screen while the next arrives, so the list does not jump.
  const result = state.kind === 'ready' ? state.value : null
  const isCurrent = state.kind !== 'loading' && answeredKey === key

  useEffect(() => {
    if (isCurrent && focusHeading.current) {
      focusHeading.current = false
      headingRef.current?.focus()
    }
  }, [isCurrent])
  return { key, state, result, isCurrent }
}
