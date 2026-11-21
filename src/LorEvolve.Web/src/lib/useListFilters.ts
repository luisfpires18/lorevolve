import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * A list's filter kept in the address: `update` writes it, dropping empty values, and starts from the first page
 * unless the change names one; typing settles before the address (and so the request) changes.
 * `followAddress` also moves the box when the address moves on its own (Back, Forward, a link). `memo` keeps `update`
 * the same function across renders. The boards list has neither (G1).
 */
export function useListFilters({
  typed,
  setTyped,
  setParams,
  search,
  followAddress,
  memo,
}: {
  typed: string
  setTyped: Dispatch<SetStateAction<string>>
  setParams: SetURLSearchParams
  search: string
  followAddress: boolean
  memo: boolean
}) {
  function write(change: Record<string, string | null>) {
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
  }
  const memoised = useCallback(write, [setParams])
  const update = memo ? memoised : write

  // The box never overwrites what is being typed with the filter it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (!followAddress) return
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search, followAddress, setTyped])

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
