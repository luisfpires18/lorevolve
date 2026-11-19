import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from './api'
import { errorText } from './errorText'

/** A read's state. `missing` is a real 404 only (with the `missing` option); a read that failed is `error`. */
export type Load<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: T }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export interface AsyncReadOptions<T> {
  /** A 404 is `missing` instead of `error`. Any other failure stays `error`. */
  missing?: boolean
  /** The state before the first read lands, for a screen that starts ready (a new, unsaved thing). */
  initial?: Load<T>
  /** The fallback message when the error carries none. */
  failed?: string
}

/** True for the 404 a read reports when the thing is gone. */
export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

/**
 * One read: loading, ready, missing or failed. `retry` shows loading again and reads again; `refresh` reads quietly,
 * and a refresh that fails keeps the value already shown (only a first read that fails says so). `read` must be
 * stable (a module function or a memoized one): a new one reads again. `read` returning `undefined` with an
 * `initial` state given skips the read and keeps that state.
 */
export function useAsyncRead<T>(
  read: (signal: AbortSignal) => Promise<T> | undefined,
  options: AsyncReadOptions<T> = {},
) {
  const { t } = useI18n()
  const { missing = false, initial, failed } = options
  const [load, setLoad] = useState<Load<T>>(initial ?? { kind: 'loading' })
  const [readKey, setReadKey] = useState(0)
  const quiet = useRef(false)
  const initialRef = useRef(initial)

  useEffect(() => {
    const controller = new AbortController()
    const keepShown = quiet.current
    quiet.current = false
    const reading = read(controller.signal)
    if (!reading) {
      if (initialRef.current) setLoad(initialRef.current)
      return () => controller.abort()
    }
    reading
      .then((value) => setLoad({ kind: 'ready', value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (missing && isNotFound(error)) return setLoad({ kind: 'missing' })
        setLoad((now) =>
          keepShown && now.kind === 'ready'
            ? now
            : { kind: 'error', message: errorText(error, failed ?? t('shell.app.loadFailed')) },
        )
      })
    return () => controller.abort()
  }, [read, readKey, t, missing, failed])

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
