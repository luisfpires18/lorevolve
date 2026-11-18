import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

type Load<T> =
  { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string }

/** Reads `load` once per change of it (callers memoize it on what it asks for) and again on Try again. */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const { t } = useI18n()
  const [state, setState] = useState<Load<T>>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((value) => setState({ kind: 'ready', value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('admin.loadFailed'),
        })
      })
    return () => controller.abort()
  }, [load, attempt, t])

  return { state, setState, retry: () => setAttempt((current) => current + 1) }
}
