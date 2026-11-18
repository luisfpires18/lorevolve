import { useEffect, useId, useRef, useState } from 'react'

/** The section list's open state, its id and refs, and the drawer's focus and wide-layout effects. */
export function useWorkspaceNav({ pathname }: { pathname: string }) {
  // Only the narrow layout hides the section list; on a wide screen CSS keeps it open and
  // the toggle is not shown at all, so one piece of state serves both without measuring
  // the viewport in JavaScript.
  //
  // What is stored is the route the list was opened on, not a boolean, so "open" means
  // "opened here". A section that has just been opened is then never read through the list
  // that opened it, and arriving by the browser's own back and forward closes it too -
  // both fall out of the render rather than out of an effect chasing the URL.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null)
  const isNavOpen = navOpenAt === pathname
  const navId = useId()
  const navRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Below 860px the open list is a drawer over the page (#274): focus goes into it, and back to the toggle when it
  // closes, by the Sections toggle, Escape, the scrim, or a link pressed.
  useEffect(() => {
    if (!isNavOpen) return
    const nav = navRef.current
    const first =
      nav?.querySelector<HTMLElement>('a[aria-current="page"]') ??
      nav?.querySelector<HTMLElement>('a')
    first?.focus()
    const toggle = toggleRef.current
    return () => toggle?.focus()
  }, [isNavOpen])

  // Resizing or rotating to the wide layout, where the list is always drawn, must not leave the page behind it inert.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 861px)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setNavOpenAt(null)
    }
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])

  return { navOpenAt, setNavOpenAt, isNavOpen, navId, navRef, toggleRef }
}
