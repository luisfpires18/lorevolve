import { useEffect } from 'react'

/** How long a row reached by a link stays marked, so the eye can pick it out from its neighbours. */
const ARRIVAL_MS = 2400

/**
 * Lands a link on its target: scrolled to, focused so a keyboard and a screen reader arrive there too, and marked
 * (`data-arrived`) for a moment. `runKey` runs it again for another target or the same link followed twice; the
 * mark is removed when the effect is cleaned up.
 *
 * `reveal` opens whatever hides the target first and must be a stable function. `focus` is a selector inside the
 * target to take the focus instead of the target itself.
 */
export function useArrivalMark({
  targetId,
  runKey,
  block,
  focus,
  reveal,
}: {
  /** The element to land on, or null while there is none to reach. */
  targetId: string | null
  runKey: string
  block: 'start' | 'center'
  focus?: string
  reveal?: (target: HTMLElement) => void
}) {
  useEffect(() => {
    if (targetId === null) return
    const target = document.getElementById(targetId)
    if (!target) return

    reveal?.(target)
    target.scrollIntoView({ block })
    ;(focus ? target.querySelector<HTMLElement>(focus) : target)?.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [targetId, runKey, block, focus, reveal])
}
