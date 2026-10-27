import type { KeyboardEvent, MouseEvent, SyntheticEvent } from 'react'
import { confirmDiscard } from './confirm'
import { useLeaveGuard } from './leaveGuard'

/**
 * A form's save payload as one string, for telling whether anything would change. Lists of ids are compared as sets -
 * the order a picker happens to hold them in is not a change - and everything else as the save would send it, so a
 * field typed into and cleared again, or trimmed back to what it was, reads as untouched.
 */
export function payloadKey(payload: object) {
  return JSON.stringify(payload, (_key, value: unknown) =>
    Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? [...value].sort()
      : value,
  )
}

/**
 * The unsaved-changes guard for a drawer form: while `isDirty`, every way out of the app asks `message` first, through
 * `useLeaveGuard` - a link, Sign out, the browser's Back and Forward, a reload or a closed tab - and leaving anyway closes
 * the drawer, so nothing of the draft is still open under the next page.
 *
 * `close` is the drawer's own close - Cancel, Escape and a press on the backdrop - which asks once, only when there is
 * something to lose, and closes without asking again: the drawer closing takes its leave question with it. `dialogProps`
 * go on the `<dialog>` and route Escape and the backdrop through it.
 *
 * Escape is taken on its key press rather than from the dialog's `cancel` event: a browser may refuse to let a second
 * `cancel` in a row be prevented, and would then close the dialog under a form it still holds. A key press whose default
 * something inside already took - a picker closing its list - is left alone.
 */
export function useDrawerGuard(isDirty: boolean, message: string, onClose: () => void) {
  useLeaveGuard(isDirty ? message : null, onClose)

  async function close() {
    if (isDirty && !(await confirmDiscard())) return
    onClose()
  }

  const dialogProps = {
    onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      void close()
    },
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      event.preventDefault()
      void close()
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      // Only a press on the backdrop itself lands on the dialog element.
      if (event.target === event.currentTarget) void close()
    },
  }

  return { close, dialogProps }
}
