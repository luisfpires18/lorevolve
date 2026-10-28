import { useEffect, useState } from 'react'

/**
 * Hands the focus back to whatever opened a dialog, once the dialog is gone.
 *
 * The story drawers are `<dialog>` elements shown with `showModal` and closed by unmounting, and a removed dialog leaves
 * the focus on the document's body - so someone on a keyboard or a screen reader who pressed "Edit scene" was sent back
 * to the top of the page. The opener is read during the first render, before the dialog takes the focus, and focused
 * again when the dialog unmounts, if it is still on the page. When it is not - a scene redrawn in another chapter - the
 * focus stays wherever the browser puts it.
 */
export function useReturnFocus() {
  const [opener] = useState(() => document.activeElement)

  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    },
    [opener],
  )
}
