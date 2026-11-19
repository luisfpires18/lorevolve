import { useCallback, useState } from 'react'
import { listCanonConflicts } from './api'
import { CanonConflictStatus } from './types'
import type { CanonConflictStatusValue, CanonEvaluation, CanonSeverityValue } from './types'
import { t } from '../i18n'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import { useAsyncRead } from '../lib/useAsyncRead'

/** The Canon page's state: the filters, the page, the list as read, and the check's and the decisions' progress. */
export function useCanonConflicts({ universe }: { universe: WorkspaceContext['universe'] }) {
  const [status, setStatus] = useState<CanonConflictStatusValue>(CanonConflictStatus.Pending)
  const [severity, setSeverity] = useState<CanonSeverityValue | null>(null)
  const [page, setPage] = useState(1)
  const read = useCallback(
    (signal: AbortSignal) => listCanonConflicts(universe.id, { severity, status, page }, signal),
    [universe.id, severity, status, page],
  )
  const {
    load: state,
    setLoad: setState,
    refresh: reload,
  } = useAsyncRead(read, { failed: t('canon.page.readFailed') })
  const [message, setMessage] = useState<string | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<CanonEvaluation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  return {
    status,
    setStatus,
    severity,
    setSeverity,
    page,
    setPage,
    state,
    setState,
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
