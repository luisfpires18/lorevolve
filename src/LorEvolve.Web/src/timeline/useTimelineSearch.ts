import { useCallback, useEffect, useRef } from 'react'
import type { useTimelineState } from './useTimelineState'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { changed } from '../lib/queryParams'

/** Writes filters into the address, and keeps the search box and the address in step with a pause while typing. */
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
        (current) => changed(current, change, { keepPage: 'page' in change }),
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
