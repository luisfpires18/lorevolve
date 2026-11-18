import { useEffect } from 'react'
import type { Location } from 'react-router-dom'
import type { useEntryState } from './useEntryState'

/** How long the article stays marked after a link lands on it - the story page's scene and beat mark, for the same reason. */
const ARRIVAL_MS = 2400

/** Lands a link to `#article` on the article once the entry is on screen. */
export function useEntryArrival({
  status,
  detail,
  location,
}: ReturnType<typeof useEntryState> & { location: Location }) {
  // A link to `#article` - a search result whose words were in the article - lands on it once the entry is on screen:
  // scrolled to, the focus on its heading, and marked for a moment. The entry's id and the location's key run it again for
  // another entry, or the same link followed twice.
  const arrivedFor = status === 'ready' ? (detail?.id ?? null) : null
  useEffect(() => {
    if (arrivedFor === null || location.hash !== '#article') return
    const target = document.getElementById('article')
    if (!target) return

    target.scrollIntoView({ block: 'start' })
    target.querySelector<HTMLElement>('[data-arrival-focus]')?.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [arrivedFor, location.hash, location.key])
}
