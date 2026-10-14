import { ApiError } from './api'

/**
 * Whether a refused save is the "changed while you were editing" refusal with this code (ADR 0043): a 409 carrying the
 * resource's own machine-readable code. Read from the code alone, never from the message.
 */
export function isChangedElsewhere(error: unknown, code: string) {
  return error instanceof ApiError && error.status === 409 && error.code === code
}

/** One field of a form whose latest saved value differs from the author's unsaved one, both in the reader's words. */
export interface Change {
  label: string
  latest: string
  mine: string
}

/** The rows whose two values differ. A row that reads the same both ways is no change worth showing. */
export function differing(rows: Change[]) {
  return rows.filter((row) => row.latest !== row.mine)
}
