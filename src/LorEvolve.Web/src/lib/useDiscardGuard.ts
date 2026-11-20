import type { ReactNode } from 'react'
import { confirmDiscard } from './confirm'
import { useLeaveGuard } from './leaveGuard'

/**
 * The unsaved-changes guard for an inline form, one that is not a drawer: while `isDirty`, leaving the page asks
 * `message` first, and `confirmLeave()` - for its Cancel - is true at once when there is nothing to lose, else asks
 * `confirmDiscard(discardTitle)`. A drawer uses `useDrawerGuard` instead.
 */
export function useDiscardGuard(isDirty: boolean, message: string, discardTitle?: ReactNode) {
  useLeaveGuard(isDirty ? message : null)

  async function confirmLeave() {
    return !isDirty || (await confirmDiscard(discardTitle))
  }

  return { confirmLeave }
}
