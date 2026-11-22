import { apiFetch } from '../lib/api'
import type { ChangeEditable, Proposal, ProposalPage, ProposalState, Receipt } from './types'

/*
 * Pending AI Changes (ADR 0047): proposals an AI staged - from an app over MCP, or from the web assistant before M4
 * retired it - and the decisions
 * a person makes on them. Every enum mirrors the backend and is sent as its number, like every enum this API sends.
 */

/** The 409 codes a decision can meet, so a screen never matches prose. */
export const PROPOSAL_CHANGED = 'ai_change_proposal_changed'
export const ALREADY_DECIDED = 'ai_change_already_decided'
export const NOT_OPEN = 'ai_change_not_open'
export const MISSING_DEPENDENCY = 'ai_change_missing_dependency'
export const CANNOT_APPROVE = 'ai_change_cannot_approve'
export const COMMIT_REFUSED = 'ai_change_commit_refused'
export const BLOCKED = 'ai_change_blocked'

export function listProposals(
  state: ProposalState,
  universeId: string | null,
  before: string | null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ state })
  if (universeId) query.set('universeId', universeId)
  if (before) query.set('before', before)
  return apiFetch<ProposalPage>(`/api/ai-changes?${query}`, { signal })
}

function proposalPath(universeId: string, proposalId: string) {
  return `/api/universes/${universeId}/ai-changes/${proposalId}`
}

/** Where a proposal is reviewed in the app. */
export function reviewPath(universeId: string, proposalId: string) {
  return `/app/universes/${universeId}/ai-changes/${proposalId}`
}

export function getProposal(universeId: string, proposalId: string, signal?: AbortSignal) {
  return apiFetch<Proposal>(proposalPath(universeId, proposalId), { signal })
}

/** Approves these changes over the revision they were reviewed at. Sending the same approval id again applies nothing twice. */
export function approveChanges(
  universeId: string,
  proposalId: string,
  revision: number,
  operationIds: string[],
  approvalId: string,
) {
  return apiFetch<Receipt>(`${proposalPath(universeId, proposalId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ revision, operationIds, approvalId }),
  })
}

/** How far the caller's own running approval has got; missing once it has finished. */
export function getApprovalProgress(
  universeId: string,
  proposalId: string,
  approvalId: string,
  signal?: AbortSignal,
) {
  return apiFetch<{ done: number; total: number }>(
    `${proposalPath(universeId, proposalId)}/approve/${approvalId}/progress`,
    { signal },
  )
}

export function rejectChanges(
  universeId: string,
  proposalId: string,
  operationIds: string[] | null,
) {
  return apiFetch<Proposal>(`${proposalPath(universeId, proposalId)}/reject`, {
    method: 'POST',
    body: JSON.stringify(operationIds ? { operationIds } : { all: true }),
  })
}

export function editChange(
  universeId: string,
  proposalId: string,
  operationId: string,
  revision: number,
  values: ChangeEditable,
) {
  return apiFetch<Proposal>(`${proposalPath(universeId, proposalId)}/operations/${operationId}`, {
    method: 'PUT',
    body: JSON.stringify({ revision, values }),
  })
}
