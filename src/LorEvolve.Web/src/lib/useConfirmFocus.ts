import { useEffect, useRef, type RefObject } from 'react'

type Opener = RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined)

/**
 * An inline confirm's focus: the panel takes it when the confirm opens (or asks about something else), and when it
 * closes the focus goes back to `opener` - a button's ref, or a function that finds the button, or nothing when it
 * should stay where it is. Runs after the render, so an opener that comes back with the close is already there.
 */
export function useConfirmFocus(
  open: unknown,
  panelRef: RefObject<HTMLElement | null>,
  opener?: Opener,
) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpen.current = true
      panelRef.current?.focus()
    } else if (wasOpen.current) {
      wasOpen.current = false
      ;(typeof opener === 'function' ? opener() : opener?.current)?.focus()
    }
  }, [open])
}
