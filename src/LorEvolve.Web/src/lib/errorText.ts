/** The message a caught error shows: its own message, or the caller's fallback when it carries none. */
export const errorText = <T = string>(error: unknown, fallback: T): string | T =>
  error instanceof Error ? error.message : fallback
