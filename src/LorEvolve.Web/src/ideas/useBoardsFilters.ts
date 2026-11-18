import { useEffect } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'
import type { useBoardsState } from './useBoardsState'

/** The boards list's filter in the address: `update` changes it, and typing settles into it. */
export function useBoardsFilters({
  typed,
  setParams,
  search,
}: ReturnType<typeof useBoardsState> & { setParams: SetURLSearchParams; search: string }) {
  function update(change: Record<string, string | null>) {
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
      { replace: 'q' in change },
    )
  }

  // Typing settles before the address - and so the request - changes.
  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => update({ q: typed.trim() === '' ? '' : typed }), 200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, search])

  return { update }
}
