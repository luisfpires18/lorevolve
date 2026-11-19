import { useCallback, useEffect, useRef } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import type { useIdeasState } from './useIdeasState'
import { useDebouncedValue } from '../lib/useDebouncedValue'

/** An ideas list's filter in the address: `update` writes it, and the search box and the address follow each other. */
export function useIdeasFilters({
  typed,
  setTyped,
  setParams,
  search,
}: ReturnType<typeof useIdeasState> & { setParams: SetURLSearchParams; search: string }) {
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
  // being typed with the filter it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search])

  // Typing settles before the address - and so the request - changes.
  const settled = useDebouncedValue(typed)
  useEffect(() => {
    if (settled === search) return
    const next = settled.trim() === '' ? '' : settled
    written.current = next
    update({ q: next })
    // Only a settled word writes the address; an address that moved by itself is not written back over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])

  return { update }
}
