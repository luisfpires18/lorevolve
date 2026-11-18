import { useCallback, useEffect, useRef } from 'react'
import type { useTimelineState } from './useTimelineState'

/** Writes filters into the address, and keeps the search box and the address in step with a 250 ms pause while typing. */
export function useTimelineSearch({
  setParams,
  search,
  typed,
  setTyped,
}: ReturnType<typeof useTimelineState>) {
  /** Writes filters into the address, dropping empty ones, and starts from the first page unless told otherwise. */
  const update = useCallback(
    (change: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(change)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in change)) next.delete('page')
          return next
        },
        // Typing is one filter being written, not a history entry per pause.
        { replace: 'q' in change },
      )
    },
    [setParams],
  )

  // The box follows the address when the address moves on its own - Back, Forward, a link - and never overwrites what is
  // being typed with the search it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search])

  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => {
      const next = typed.trim() === '' ? '' : typed
      written.current = next
      update({ q: next })
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [typed, search, update])

  return { update }
}
