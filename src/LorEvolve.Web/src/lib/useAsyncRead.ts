import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from './api'
import { errorText } from './errorText'
import { settleRead } from './settleRead'

/** A read's state. `missing` is a real 404 only (with the `missing` option); a read that failed is `error`. */
export type Load<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: T }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

export interface AsyncReadOptions<T> {
  /**
   * A 404 is `missing` instead of `error`; a function decides which errors are `missing` (a 403 too, for a read that
   * must not say the thing exists). Any other failure stays `error`. A function is an effect dependency: keep it stable.
   */
  missing?: boolean | ((error: unknown) => boolean)
  /** The state before the first read lands, for a screen that starts ready (a new, unsaved thing). */
  initial?: Load<T>
  /** The fallback message when the error carries none. */
  failed?: string
  /**
   * What the read is for (an id). A new key shows loading in that same render, so a screen never draws, or navigates
   * from, the last key's answer for one frame.
   */
  key?: string
  /** `false`: a refresh that fails shows the failure instead of keeping the value shown. */
  keepOnFailure?: boolean
  /**
   * `true`: loading shows only on the first read and on `retry`; a new read (another page, filter or key) keeps the
   * last answer on screen until the new one lands, so paging and filtering never blank the screen.
   */
  keep?: boolean
}

/** True for the 404 a read reports when the thing is gone. */
export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

/** A 404 or a 403: a read the account may not open says not found, never that the thing exists (G9). */
export const isNotFoundOrForbidden = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403)

/**
 * One read: loading, ready, missing or failed. `retry` shows loading again and reads again; `refresh` reads quietly,
 * and a refresh that fails keeps the value already shown (only a first read that fails says so). `read` must be
 * stable (a module function or a memoized one): a new one reads again. `read` returning `undefined` skips the read:
 * with an `initial` state given it keeps that state, without one the current state stays as it is. `failed` is an
 * effect dependency, so pass a stable string (a literal or a translated key), never a new one each render.
 */
export function useAsyncRead<T>(
  read: (signal: AbortSignal) => Promise<T> | undefined,
  options: AsyncReadOptions<T> = {},
) {
  const { t } = useI18n()
  const { missing = false, initial, failed, key, keepOnFailure = true, keep = false } = options
  const [load, setLoad] = useState<Load<T>>(initial ?? { kind: 'loading' })
  const [shownKey, setShownKey] = useState(key)
  if (shownKey !== key) {
    setShownKey(key)
    if (!keep) setLoad({ kind: 'loading' })
  }
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
    // A new read (another id) never shows the last answer under the new one, unless `keep`; a refresh keeps it.
    if (!keepShown && !keep) setLoad((now) => (now.kind === 'loading' ? now : { kind: 'loading' }))
    settleRead(
      reading,
      controller.signal,
      (value) => setLoad({ kind: 'ready', value }),
      (error) => {
        if (typeof missing === 'function' ? missing(error) : missing && isNotFound(error))
          return setLoad({ kind: 'missing' })
        setLoad((now) =>
          keepShown && keepOnFailure && now.kind === 'ready'
            ? now
            : { kind: 'error', message: errorText(error, failed ?? t('shell.app.loadFailed')) },
        )
      },
    )
    return () => controller.abort()
  }, [read, readKey, t, missing, failed, keepOnFailure, keep])

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
