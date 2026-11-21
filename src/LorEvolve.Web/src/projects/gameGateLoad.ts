import type { Load } from '../lib/useAsyncRead'

/**
 * What the Game Entities gate reads through (#456). An address that cannot name anything (`notFound`) is the
 * not-found state at once, whatever the game read is doing, so it never shows a loading or a failure line first.
 */
export function gameGateLoad<T>(
  read: { loading: boolean; failed: boolean; game: T | null },
  notFound: boolean,
  failedMessage: string,
): Load<T | null> {
  if (notFound) return { kind: 'ready', value: null }
  if (read.loading) return { kind: 'loading' }
  if (read.failed) return { kind: 'error', message: failedMessage }
  return { kind: 'ready', value: read.game }
}
