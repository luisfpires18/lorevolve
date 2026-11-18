import { useEffect, type RefObject } from 'react'
import { useReturnFocus } from '../lib/returnFocus'

/** Puts the focus on the drawer's first field, and back on whatever opened it once it closes. */
export function useDrawerFocus(dialog: RefObject<HTMLDialogElement | null>) {
  useReturnFocus()
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [dialog])
}
