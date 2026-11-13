import { useEffect, useId, useRef, useState } from 'react'

/*
 * Folding for a story's arcs, chapters and scenes, so a story of hundreds stays a short list on load. Each starts folded
 * and its body stays mounted under `hidden`: the page's links and focus moves still find a row by its id, and call
 * `revealInFolds` first to open every fold around it.
 */

const REVEAL = 'lorevolve:reveal'

/** Opens every fold holding `target` (and the target's own). The folds open on the next render, so scroll to and focus the target in the frame after. */
export function revealInFolds(target: Element | null) {
  target?.dispatchEvent(new Event(REVEAL, { bubbles: true }))
}

/** A fold's open state, its body's id, and the ref its container takes so `revealInFolds` can open it. */
export function useFold<T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const ref = useRef<T>(null)
  const bodyId = useId()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const reveal = () => setOpen(true)
    element.addEventListener(REVEAL, reveal)
    return () => element.removeEventListener(REVEAL, reveal)
  }, [])

  return { open, setOpen, ref, bodyId }
}
