import { useEffect, useEffectEvent, useState } from 'react'

/**
 * A row's detail, read the first time the row is opened rather than with the list. Closing the row while the read
 * is under way aborts it; opening it again reads again. A failed read stays reported, as the rows always showed it.
 */
export function useReadOnOpen<T>(open: boolean, read: (signal: AbortSignal) => Promise<T>) {
  const [detail, setDetail] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)
  const start = useEffectEvent((signal: AbortSignal) => read(signal))

  useEffect(() => {
    if (!open || detail) return

    const controller = new AbortController()

    start(controller.signal)
      .then((value) => setDetail(value))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [open, detail])

  return { detail, setDetail, failed }
}
