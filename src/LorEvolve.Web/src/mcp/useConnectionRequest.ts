import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errorText'
import type { Load } from '../lib/useAsyncRead'
import { t } from '../i18n'
import {
  describeConnectionRequest,
  getConsentToken,
  type ConnectionRequestDetails,
  type ConsentToken,
} from './api'

/** The request's read, plus the two answers this screen turns down: a request the server refused, and no access. */
export type ConnectionLoad =
  Load<ConnectionRequestDetails> | { kind: 'invalid' } | { kind: 'no-access' }

/** Reads the request to decide on and the antiforgery token the decision must carry. */
export function useConnectionRequest({
  params,
  setLoad,
  setToken,
}: {
  params: URLSearchParams
  setLoad: Dispatch<SetStateAction<ConnectionLoad>>
  setToken: (token: ConsentToken) => void
}) {
  useEffect(() => {
    const controller = new AbortController()
    // A failure to read the antiforgery token (below) stands: without it there is nothing to decide with.
    const settle = (next: ConnectionLoad) =>
      setLoad((current) => (current.kind === 'error' ? current : next))
    describeConnectionRequest(params, controller.signal)
      .then((details) => settle({ kind: 'ready', value: details }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'universe_unavailable')
          settle({ kind: 'no-access' })
        else if (error instanceof ApiError && error.status === 400) settle({ kind: 'invalid' })
        else settle({ kind: 'error', message: errorText(error, t('shell.app.loadFailed')) })
      })
    return () => controller.abort()
  }, [params])

  // The antiforgery token the decision must carry. Without it nothing can be decided here, so failing to read it fails
  // the screen.
  useEffect(() => {
    const controller = new AbortController()
    getConsentToken(controller.signal)
      .then(setToken)
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoad({ kind: 'error', message: errorText(error, t('shell.app.loadFailed')) })
      })
    return () => controller.abort()
  }, [])
}
