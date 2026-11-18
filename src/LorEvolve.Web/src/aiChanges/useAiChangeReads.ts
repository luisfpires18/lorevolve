import { useEffect } from 'react'
import { getProposal } from './api'
import { ApiError } from '../lib/api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useAiChangeState } from './useAiChangeState'

/** Reads the proposal, again on request, and moves the focus to new feedback. */
export function useAiChangeReads({
  universe,
  proposalId,
  reads,
  setLoad,
  feedback,
  feedbackLine,
}: ReturnType<typeof useAiChangeState> & {
  universe: WorkspaceContext['universe']
  proposalId: string
}) {
  useEffect(() => {
    const controller = new AbortController()
    getProposal(universe.id, proposalId, controller.signal)
      .then((proposal) => setLoad({ kind: 'ready', proposal }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })
    return () => controller.abort()
  }, [universe.id, proposalId, reads])

  useEffect(() => {
    if (feedback) feedbackLine.current?.focus()
  }, [feedback])
}
