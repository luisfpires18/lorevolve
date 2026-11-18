import type { CanonStatusValue } from '../lore/types'

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
  // 9 was a plot beat, retired with plot beats (ADR 0070).
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
  /** The app's own name, as it registered itself. Null for a proposal the retired web assistant staged. */
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

export type ProposalState = 'open' | 'decided'
