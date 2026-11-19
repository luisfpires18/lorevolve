import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { errorText } from './errorText'

export type Load<T> =
  { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string }

/**
 * One read: loading, ready or failed. `retry` shows loading again and reads again; `refresh` reads quietly, and a
 * refresh that fails keeps the value already shown (only a first read that fails says so). `read` must be stable (a
 * module function or a memoized one): a new one reads again.
 */
export function useAsyncRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const { t } = useI18n()
  const [load, setLoad] = useState<Load<T>>({ kind: 'loading' })
  const [readKey, setReadKey] = useState(0)
  const quiet = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    const keepShown = quiet.current
    quiet.current = false
    read(controller.signal)
      .then((value) => setLoad({ kind: 'ready', value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad((now) =>
          keepShown && now.kind === 'ready'
            ? now
            : { kind: 'error', message: errorText(error, t('shell.app.loadFailed')) },
        )
      })
    return () => controller.abort()
  }, [read, readKey, t])

  const refresh = useCallback(() => {
    quiet.current = true
    setReadKey((key) => key + 1)
  }, [])
  const retry = useCallback(() => {
    setLoad({ kind: 'loading' })
    setReadKey((key) => key + 1)
  }, [])

  return { load, setLoad, retry, refresh }
}
