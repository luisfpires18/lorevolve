import { useEffect, useState } from 'react'

/** How long typing must pause before a read or an address change follows it. One delay for every search. */
export const DEBOUNCE_MS = 200

/** `value` once it has stopped changing for `delay`. The first value is returned at once. */
export function useDebouncedValue<T>(value: T, delay = DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, settled, delay])
  return settled
}
