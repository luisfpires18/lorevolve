import { useCallback, useEffect, useState } from 'react'

export type UsageLoad<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: T }

/**
 * One usage read for the Profile's Usage section: loading, failed or the value. `retry` shows the loading state again;
 * `refresh` reads quietly, and a refresh that fails keeps the numbers already shown - only a first read that fails says
 * so. Each item has its own, so one that fails never hides another. `read` must be stable (a module function): a new one
 * reads again.
 */
export function useUsageLoad<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [load, setLoad] = useState<UsageLoad<T>>({ kind: 'loading' })
  const [readKey, setReadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    read(controller.signal)
      .then((value) => setLoad({ kind: 'ready', value }))
      .catch(() => {
        if (!controller.signal.aborted)
          setLoad((now) => (now.kind === 'ready' ? now : { kind: 'error' }))
      })

    return () => {
      controller.abort()
    }
  }, [read, readKey])

  const refresh = useCallback(() => setReadKey((key) => key + 1), [])
  const retry = useCallback(() => {
    setLoad({ kind: 'loading' })
    setReadKey((key) => key + 1)
  }, [])

  return { load, refresh, retry }
}
