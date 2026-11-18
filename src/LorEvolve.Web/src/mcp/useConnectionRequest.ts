import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { ApiError } from '../lib/api'
import {
  describeConnectionRequest,
  getConsentToken,
  type ConnectionRequestDetails,
  type ConsentToken,
} from './api'

export type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; details: ConnectionRequestDetails }
  | { kind: 'invalid' }
  | { kind: 'no-access' }
  | { kind: 'error' }

/** Reads the request to decide on and the antiforgery token the decision must carry. */
export function useConnectionRequest({
  params,
  setLoad,
  setToken,
}: {
  params: URLSearchParams
  setLoad: Dispatch<SetStateAction<Load>>
  setToken: (token: ConsentToken) => void
}) {
  useEffect(() => {
    const controller = new AbortController()
    // A failure to read the antiforgery token (below) stands: without it there is nothing to decide with.
    const settle = (next: Load) => setLoad((current) => (current.kind === 'error' ? current : next))
    describeConnectionRequest(params, controller.signal)
      .then((details) => settle({ kind: 'ready', details }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'universe_unavailable')
          settle({ kind: 'no-access' })
        else if (error instanceof ApiError && error.status === 400) settle({ kind: 'invalid' })
        else settle({ kind: 'error' })
      })
    return () => controller.abort()
  }, [params])

  // The antiforgery token the decision must carry. Without it nothing can be decided here, so failing to read it fails
  // the screen.
  useEffect(() => {
    const controller = new AbortController()
    getConsentToken(controller.signal)
      .then(setToken)
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ kind: 'error' })
      })
    return () => controller.abort()
  }, [])
}
