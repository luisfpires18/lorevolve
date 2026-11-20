import { useEffect, useRef, useState } from 'react'
import { errorText } from './errorText'
import { settleRead } from './settleRead'

interface LoadedListOptions<T> {
  /** False holds the first read back, for a list folded away until asked for. Default: true. */
  enabled?: boolean
  /** Given: a first read that fails shows this list under the message. Absent: `data` stays null. */
  emptyOnFail?: T
  /** A failed change's fallback words. Default: `failedText`. */
  actionFailed?: string
}

/**
 * A list read once, then read again after every change made from it. `read` must be stable (a `useCallback`), as
 * `useAsyncRead` asks; the first read is cancelled when the screen goes.
 *
 * `settle(value)` shows a list and ends a change; `refresh()` reads again and never rejects; `failing(error)` ends a
 * change with its message and keeps the list; `run(work)` marks the list busy, runs the change, then refreshes. One read
 * with no changes is `useAsyncRead`.
 */
export function useLoadedList<T>(
  read: (signal?: AbortSignal) => Promise<T>,
  failedText: string,
  { enabled = true, emptyOnFail, actionFailed }: LoadedListOptions<T> = {},
) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const texts = useRef({ failedText, emptyOnFail, actionFailed })
  useEffect(() => {
    texts.current = { failedText, emptyOnFail, actionFailed }
  })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    settleRead(read(controller.signal), controller.signal, setData, (error) => {
      const { emptyOnFail: empty, failedText: text } = texts.current
      if (empty !== undefined) setData(empty)
      setFailed(errorText(error, text))
    })
    return () => controller.abort()
  }, [enabled, read])

  function settle(value: T) {
    setData(value)
    setBusy(false)
    setFailed(null)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(errorText(error, texts.current.actionFailed ?? texts.current.failedText))
  }

  function refresh() {
    return read()
      .then(settle)
      .catch((error: unknown) => {
        setBusy(false)
        setFailed(errorText(error, texts.current.failedText))
      })
  }

  function run(work: () => Promise<unknown>) {
    setBusy(true)
    work().then(refresh).catch(failing)
  }

  return { data, setData, failed, setFailed, busy, setBusy, settle, refresh, failing, run }
}
