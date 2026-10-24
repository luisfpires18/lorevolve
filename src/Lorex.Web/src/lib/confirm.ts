import type { ReactNode } from 'react'
import { ApiError } from './api'

/**
 * How much a confirmation is about to cost. `neutral` takes nothing away, so its confirm button has the focus.
 * `warning` takes something away that can be brought back (the Trash). `destructive` cannot be undone - unsaved work, a
 * permanent delete - and its confirm button is the danger one. Both start on Cancel.
 */
export type ConfirmVariant = 'neutral' | 'warning' | 'destructive'

export interface ConfirmOptions {
  /** The question, naming what it is about: "Move “Thalori's Origins” to the Trash?" */
  title: ReactNode
  /** What happens, in a sentence or two. */
  message?: ReactNode
  /** What goes with it, one line each: "3 chapters", "6 scenes, with every manuscript". */
  details?: ReactNode[]
  /** The verb, never OK: "Move to Trash", "Discard changes". */
  confirmLabel: string
  cancelLabel?: string
  variant?: ConfirmVariant
  /** Said on the confirm button while `action` runs: "Moving…". */
  busyLabel?: string
  /**
   * The operation itself, run by the dialog: it closes only once this succeeds. A failure keeps it open with the reason -
   * `failure` (a sentence, or one worked out from the error), else an `ApiError`'s own message - and the author may try
   * again or cancel.
   */
  action?: () => Promise<unknown>
  failure?: string | ((error: unknown) => string)
}

export function failureText(error: unknown, failure: ConfirmOptions['failure']) {
  if (typeof failure === 'function') return failure(error)
  if (error instanceof ApiError) return error.message
  return failure ?? 'That could not be done. Try again.'
}

export interface ConfirmRequest {
  id: number
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

// One dialog at a time, app-wide: a second question waits for the first to be answered.
let queue: ConfirmRequest[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeConfirm(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The question on screen, if any. */
export function currentConfirm() {
  return queue[0] ?? null
}

/** Answers a question: it leaves the queue, and whoever asked hears `confirmed`. */
export function settleConfirm(request: ConfirmRequest, confirmed: boolean) {
  queue = queue.filter((each) => each !== request)
  emit()
  request.resolve(confirmed)
}

/**
 * Asks before something consequential, in LoreX's own dialog (Issue #50), and answers true once it is confirmed - and,
 * when `action` is given, once that has succeeded. Cancel, Escape and a press outside answer false and run nothing.
 * Callable from anywhere, components or not; `ConfirmHost` (components/ConfirmDialog), mounted once beside the router, draws it.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { id: nextId++, options, resolve }]
    emit()
  })
}

/**
 * The one question before unsaved work is let go: Keep editing has the focus, and Discard changes is the danger button.
 * `title` names what is open - "Close the article without saving your changes?" - when that says more than the default.
 */
export function confirmDiscard(title: ReactNode = 'Close without saving your changes?') {
  return confirmAction({
    title,
    message: 'They will be lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    variant: 'destructive',
  })
}
