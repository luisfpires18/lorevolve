/**
 * Hands a read's outcome to `onValue` or `onError`, unless `signal` was aborted first: a read that ignores the signal
 * (a composed one that swallows its errors) can still resolve late, and its value must not land on a newer read.
 */
export function settleRead<T>(
  reading: Promise<T>,
  signal: AbortSignal,
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
) {
  reading
    .then((value) => {
      if (!signal.aborted) onValue(value)
    })
    .catch((error: unknown) => {
      if (!signal.aborted) onError(error)
    })
}
