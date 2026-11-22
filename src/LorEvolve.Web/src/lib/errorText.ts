import { ApiError } from './api'

/** The message a caught error shows: its own message, or the caller's fallback when it carries none. */
export const errorText = <T = string>(error: unknown, fallback: T): string | T =>
  error instanceof Error ? error.message : fallback

/**
 * A removal the server answers with 404: already gone (removed in another tab), which is what was asked for. Only for
 * removing a collaborator, revoking an invitation and disconnecting an app (#456 G18); elsewhere a 404 is a failure.
 */
export const quietlyGone = (error: unknown) => error instanceof ApiError && error.status === 404
