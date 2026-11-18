import { useEffect } from 'react'
import { revealInFolds } from '../components/fold'
import type { Location } from 'react-router-dom'
import type { StoryViewName, useStoryState } from './useStoryState'

/** How long a scene reached by a link stays marked, so the eye can pick it out from its neighbours. */
const ARRIVAL_MS = 2400

/** Puts the focus back on a moved row's menu, and takes a link to a scene to the scene. */
export function useStoryArrival({
  pendingFocus,
  state,
  view,
  location,
}: ReturnType<typeof useStoryState> & { view: StoryViewName; location: Location }) {
  // Whatever has just moved keeps the focus on its own ⋯ menu, wherever the page put it: the move was made from that
  // menu, and moving the row in the page can take the focus off it.
  useEffect(() => {
    const selector = pendingFocus.current
    if (!selector || state.kind !== 'ready') return
    pendingFocus.current = null
    const target = document.querySelector<HTMLElement>(selector)
    // The folds around it open before this returns, so a hidden row can still take the focus.
    revealInFolds(target)
    target?.focus()
  }, [state])

  // A link to one scene - a search result, or the manuscript's way back to its scene - lands on it, whichever view it
  // opens: scrolled to, given the focus so a keyboard and a screen reader arrive there too, and
  // marked for a moment so the eye can tell which of twenty rows it meant. The location's key runs it again when the
  // same link is followed twice.
  const isReady = state.kind === 'ready'
  useEffect(() => {
    if (!isReady || location.hash.length < 2) return
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (!target) return

    revealInFolds(target)
    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [isReady, view, location.hash, location.key])
}
