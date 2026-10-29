import { apiFetch } from '../lib/api'
import type { CanonStatusValue } from '../lore/types'

/*
 * Pending AI Changes (ADR 0047): proposals an AI staged - from an app over MCP or from the assistant - and the decisions
 * a person makes on them. Every enum mirrors the backend and is sent as its number, like every enum this API sends.
 */

export const AiChangeSource = { Mcp: 0, Assistant: 1 } as const
export type AiChangeSourceValue = (typeof AiChangeSource)[keyof typeof AiChangeSource]

export const ProposalStatus = {
  Open: 0,
  Approved: 1,
  PartiallyApproved: 2,
  Rejected: 3,
  Expired: 4,
} as const
export type ProposalStatusValue = (typeof ProposalStatus)[keyof typeof ProposalStatus]

export const ChangeStatus = { Pending: 0, Committed: 1, Rejected: 2 } as const
export type ChangeStatusValue = (typeof ChangeStatus)[keyof typeof ChangeStatus]

export const ChangeResource = {
  LoreEntry: 0,
  Relationship: 1,
  Story: 2,
  Chapter: 3,
  Scene: 4,
  Manuscript: 5,
  TimelineEvent: 6,
  Article: 7,
  PlotArc: 8,
  PlotBeat: 9,
  WorldRule: 10,
  /** One of the universe owner's own ideas (ADR 0048). Only its proposer ever sees such a change. */
  Idea: 11,
  /** Schema (ADR 0062): a lore type, a field definition, a semantic group. Never in a proposal with content. */
  LoreType: 12,
  LoreField: 13,
  LoreGroup: 14,
  RelationshipType: 15,
  /** The universe's date periods and calendar, written whole. */
  Chronology: 16,
  /** An event kind or a method of the world rule vocabulary. */
  ValidationTerm: 17,
  /** One entry's eras, forms, abilities and appearances, added to or changed. Content. */
  Progression: 18,
  /** A picture for an entry or an appearance: the person uploads the file here, and it waits in quarantine until approved. */
  Media: 19,
} as const
export type ChangeResourceValue = (typeof ChangeResource)[keyof typeof ChangeResource]

export const ChangeAction = { Create: 0, Update: 1, Remove: 2, Reorder: 3 } as const
export type ChangeActionValue = (typeof ChangeAction)[keyof typeof ChangeAction]

export interface ProposalSummary {
  id: string
  universeId: string
  universeName: string
  source: AiChangeSourceValue
  /** The app's own name, as it registered itself. Null for the assistant. */
  clientName: string | null
  proposedByName: string | null
  proposedByMe: boolean
  /** The AI's own one line about the proposal: plain text, never markup. */
  summary: string | null
  status: ProposalStatusValue
  createdAt: string
  expiresAt: string
  operationCount: number
  pendingCount: number
  committedCount: number
  createCount: number
  updateCount: number
  removeCount: number
}

export interface ChangeIssue {
  code: string
  message: string
  field: string | null
}

export interface ChangeLine {
  label: string
  before: string | null
  after: string | null
}

export interface ChangeEditable {
  name?: string | null
  title?: string | null
  summary?: string | null
  premise?: string | null
  notes?: string | null
  description?: string | null
  text?: string | null
  canonStatus?: CanonStatusValue | null
}

export interface ChangeProse {
  append: boolean
  /** What is stored now, while the change still applies to it. */
  current: string | null
  proposed: string
}

export interface Change {
  id: string
  key: string
  sequence: number
  resource: ChangeResourceValue
  action: ChangeActionValue
  status: ChangeStatusValue
  title: string
  targetId: string | null
  storyId: string | null
  lines: ChangeLine[]
  dependsOn: string[]
  neededBy: string[]
  issues: ChangeIssue[]
  isConflict: boolean
  impact: { notes: string[] } | null
  editable: ChangeEditable | null
  prose: ChangeProse | null
  resultId: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  /** A picture change's file: not uploaded yet, or uploaded and previewable here. Null for every other change. */
  media?: ChangeMedia | null
}

export interface ChangeMedia {
  uploaded: boolean
  fileName: string | null
  contentType: string | null
  width: number | null
  height: number | null
  byteSize: number | null
  uploadedAt: string | null
}

/** The quarantined picture's preview, behind the session like every other LorEvolve picture. */
export function mediaPreviewPath(
  universeId: string,
  proposalId: string,
  operationId: string,
  uploadedAt: string,
) {
  return `/api/universes/${universeId}/ai-changes/${proposalId}/operations/${operationId}/media/thumbnail?at=${encodeURIComponent(uploadedAt)}`
}

/** Hands the picture over for a pending picture change; answers the proposal as it reads now. */
export function uploadChangeMedia(
  universeId: string,
  proposalId: string,
  operationId: string,
  file: File,
) {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<Proposal>(
    `/api/universes/${universeId}/ai-changes/${proposalId}/operations/${operationId}/media`,
    { method: 'PUT', body },
  )
}

export interface Proposal {
  proposal: ProposalSummary
  revision: number
  canReview: boolean
  /** Why nothing in it can be approved, when that is so. */
  blocked: string | null
  operations: Change[]
}

export interface ProposalPage {
  items: ProposalSummary[]
  hasMore: boolean
}

export interface Receipt {
  approvalId: string
  applied: {
    operationId: string
    key: string
    resource: ChangeResourceValue
    action: ChangeActionValue
    resultId: string | null
  }[]
  proposal: Proposal
}

/** The 409 codes a decision can meet, so a screen never matches prose. */
export const PROPOSAL_CHANGED = 'ai_change_proposal_changed'
export const ALREADY_DECIDED = 'ai_change_already_decided'
export const NOT_OPEN = 'ai_change_not_open'
export const MISSING_DEPENDENCY = 'ai_change_missing_dependency'
export const CANNOT_APPROVE = 'ai_change_cannot_approve'
export const COMMIT_REFUSED = 'ai_change_commit_refused'
export const BLOCKED = 'ai_change_blocked'

export type ProposalState = 'open' | 'decided'

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

export function countProposals(signal?: AbortSignal) {
  return apiFetch<{ open: number }>('/api/ai-changes/count', { signal })
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

/** Where a change's item opens once it exists: the same places search and the assistant link to. */
export function itemPath(universeId: string, change: Change) {
  const id = change.resultId ?? change.targetId
  const universe = `/app/universes/${universeId}`
  const story = change.storyId ? `${universe}/stories/${change.storyId}` : null
  // Schema lives on its own screens: Types (an archived field, relation kinds and event kinds and methods included) and Chronology.
  if (
    change.resource === ChangeResource.LoreType ||
    change.resource === ChangeResource.LoreField ||
    change.resource === ChangeResource.LoreGroup ||
    change.resource === ChangeResource.RelationshipType
  ) {
    return `${universe}/types`
  }
  if (change.resource === ChangeResource.Chronology) return `${universe}/chronology`
  if (change.resource === ChangeResource.Media) {
    return change.targetId ? `${universe}/lore/${change.targetId}` : null
  }
  if (change.resource === ChangeResource.ValidationTerm) return `${universe}/types`
  if (change.action === ChangeAction.Remove) {
    // Everything removed waits in the Trash - an idea in its owner's deleted ideas - from where it comes back.
    return change.resource === ChangeResource.Idea ? '/app/ideas' : `${universe}/trash`
  }
  if (change.action === ChangeAction.Reorder) {
    if (!story) return null
    return change.resource === ChangeResource.PlotArc || change.resource === ChangeResource.PlotBeat
      ? `${story}/plot`
      : story
  }
  if (!id) return null
  switch (change.resource) {
    case ChangeResource.LoreEntry:
    case ChangeResource.Article:
      return `${universe}/lore/${id}`
    case ChangeResource.Progression:
      return `${universe}/lore/${id}/progression`
    case ChangeResource.Relationship:
      return null
    case ChangeResource.Story:
      return `${universe}/stories/${id}`
    case ChangeResource.Chapter:
      return story ? `${story}#chapter-${id}` : null
    case ChangeResource.Scene:
      return story ? `${story}#scene-${id}` : null
    case ChangeResource.Manuscript:
      return story ? `${story}/manuscript/${id}` : null
    case ChangeResource.TimelineEvent:
      return `${universe}/timeline?moment=${id}`
    case ChangeResource.PlotArc:
      return story ? `${story}/plot#arc-${id}` : null
    case ChangeResource.PlotBeat:
      return story ? `${story}/plot#beat-${id}` : null
    case ChangeResource.WorldRule:
      return `${universe}/world-rules/${id}`
    case ChangeResource.Idea:
      return `/app/ideas/${id}`
  }
}
