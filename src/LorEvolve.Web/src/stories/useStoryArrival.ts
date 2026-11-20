import { useEffect } from 'react'
import { revealInFolds } from '../components/fold'
import { useArrivalMark } from '../lib/useArrivalMark'
import type { Location } from 'react-router-dom'
import type { StoryViewName, useStoryState } from './useStoryState'

/** The id a link's hash names, or null for no hash or one that is not valid text (read in render, so it must not throw). */
function hashTarget(hash: string) {
  if (hash.length < 2) return null
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
}

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
  useArrivalMark({
    targetId: isReady ? hashTarget(location.hash) : null,
    runKey: `${view}|${location.key}`,
    block: 'center',
    reveal: revealInFolds,
  })
}
