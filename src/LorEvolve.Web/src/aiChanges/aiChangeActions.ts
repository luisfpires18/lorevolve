import { approveChanges, getApprovalProgress, rejectChanges } from './api'
import { ChangeStatus, type Change, type Proposal } from './types'
import { ApiError, networkFailure } from '../lib/api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useI18n } from '../i18n'
import type { useAiChangeState } from './useAiChangeState'

/** The review's handlers: choosing a change with what it needs, taking a new revision, approving and rejecting. */
export function aiChangeActions({
  proposal,
  byKey,
  universe,
  t,
  tn,
  setSelected,
  setLoad,
  setFeedback,
  setBusy,
  setApplied,
  setReads,
  approval,
}: ReturnType<typeof useAiChangeState> & {
  proposal: Proposal
  byKey: Map<string, Change>
  universe: WorkspaceContext['universe']
  t: ReturnType<typeof useI18n>['t']
  tn: ReturnType<typeof useI18n>['tn']
}) {
  /** A change and, transitively, every pending change it needs. */
  function withNeeds(change: Change, into: Set<string>) {
    into.add(change.id)
    for (const key of change.dependsOn) {
      const need = byKey.get(key)
      if (need && need.status === ChangeStatus.Pending && !into.has(need.id)) withNeeds(need, into)
    }
  }

  /** A change and, transitively, every pending change that needs it. */
  function withNeededBy(change: Change, into: Set<string>) {
    into.add(change.id)
    for (const key of change.neededBy) {
      const other = byKey.get(key)
      if (other && other.status === ChangeStatus.Pending && !into.has(other.id))
        withNeededBy(other, into)
    }
  }

  function toggle(change: Change, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      const touched = new Set<string>()
      if (on) withNeeds(change, touched)
      else withNeededBy(change, touched)
      for (const id of touched) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function accept(next: Proposal, text: string) {
    setLoad({ kind: 'ready', proposal: next })
    setSelected(new Set())
    setFeedback({ text, isError: false })
  }

  async function approve(ids: string[]) {
    if (!proposal || ids.length === 0) return
    const key = `${proposal.revision}:${[...ids].sort().join(',')}`
    if (approval.current?.key !== key) approval.current = { key, id: crypto.randomUUID() }
    setBusy('approve')
    setFeedback(null)
    setApplied({ done: 0, total: ids.length })
    const approvalId = approval.current.id
    const watch = new AbortController()
    const timer = window.setInterval(() => {
      getApprovalProgress(universe.id, proposal.proposal.id, approvalId, watch.signal)
        .then((count) => {
          if (!watch.signal.aborted) setApplied(count)
        })
        .catch(() => undefined)
    }, 500)
    try {
      const receipt = await approveChanges(
        universe.id,
        proposal.proposal.id,
        proposal.revision,
        ids,
        approvalId,
      )
      approval.current = null
      accept(
        receipt.proposal,
        tn('review.aiChange.feedback.applied', receipt.applied.length, {
          n: receipt.applied.length,
        }),
      )
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 0) {
        setFeedback({
          text: t('review.aiChange.feedback.networkFailure', { failure: networkFailure() }),
          isError: true,
        })
      } else {
        approval.current = null
        setFeedback({
          text:
            error instanceof ApiError ? error.message : t('review.aiChange.feedback.applyFailed'),
          isError: true,
        })
        setReads((count) => count + 1)
      }
    } finally {
      window.clearInterval(timer)
      watch.abort()
      setApplied(null)
      setBusy(null)
    }
  }

  async function reject(ids: string[] | null) {
    if (!proposal) return
    setBusy('reject')
    setFeedback(null)
    try {
      const next = await rejectChanges(universe.id, proposal.proposal.id, ids)
      accept(
        next,
        ids === null
          ? t('review.aiChange.feedback.rejectedAll')
          : t('review.aiChange.feedback.rejected'),
      )
    } catch (error: unknown) {
      setFeedback({
        text:
          error instanceof ApiError ? error.message : t('review.aiChange.feedback.rejectFailed'),
        isError: true,
      })
      setReads((count) => count + 1)
    } finally {
      setBusy(null)
    }
  }

  return { toggle, accept, approve, reject }
}
