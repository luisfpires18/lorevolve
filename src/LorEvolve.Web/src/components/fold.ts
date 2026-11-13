import { useEffect, useId, useRef, useState } from 'react'

/*
 * Folding for a story's arcs, chapters and scenes, so a story of hundreds stays a short list on load. Each starts folded
 * and its parts stay mounted under `hidden`: the page's links and focus moves still find a row by its id, and call
 * `revealInFolds` first to open every fold around it.
 */

const REVEAL = 'lorevolve:reveal'

/**
 * Opens every fold holding `target`, and the target's own, before this returns: a hidden element takes no focus, so the
 * parts are unhidden in the page as well as in state, and the caller can scroll to the target and focus it at once.
 */
export function revealInFolds(target: Element | null) {
  target?.dispatchEvent(new Event(REVEAL, { bubbles: true }))
}

/** A fold's open state, the id its parts carry, and the ref its container takes so `revealInFolds` can open it. */
export function useFold<T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const ref = useRef<T>(null)
  const bodyId = useId()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const reveal = () => {
      setOpen(true)
      // State alone would unhide only on the next render, too late for the focus that follows this call.
      element
        .querySelectorAll<HTMLElement>(`[data-fold="${CSS.escape(bodyId)}"]`)
        .forEach((part) => part.removeAttribute('hidden'))
    }
    element.addEventListener(REVEAL, reveal)
    return () => element.removeEventListener(REVEAL, reveal)
  }, [bodyId])

  return { open, setOpen, ref, bodyId }
}
