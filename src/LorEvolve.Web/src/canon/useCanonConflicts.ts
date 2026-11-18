import { useCallback, useEffect, useState } from 'react'
import { listCanonConflicts } from './api'
import { CanonConflictStatus } from './types'
import type {
  CanonConflictPage,
  CanonConflictStatusValue,
  CanonEvaluation,
  CanonSeverityValue,
} from './types'
import { t } from '../i18n'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: CanonConflictPage }
  | { kind: 'error'; message: string }

/** The Canon page's state: the filters, the page, the list as read, and the check's and the decisions' progress. */
export function useCanonConflicts({ universe }: { universe: WorkspaceContext['universe'] }) {
  const [status, setStatus] = useState<CanonConflictStatusValue>(CanonConflictStatus.Pending)
  const [severity, setSeverity] = useState<CanonSeverityValue | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reloads, setReloads] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<CanonEvaluation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listCanonConflicts(universe.id, { severity, status, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('canon.page.readFailed'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, severity, status, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  return {
    status,
    setStatus,
    severity,
    setSeverity,
    page,
    setPage,
    state,
    setState,
    reloads,
    setReloads,
    message,
    setMessage,
    isEvaluating,
    setIsEvaluating,
    evaluation,
    setEvaluation,
    busyId,
    setBusyId,
    reload,
  }
}
