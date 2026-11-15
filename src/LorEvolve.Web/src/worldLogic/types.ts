/**
 * What the World Logic routes answer (ADR 0072). The server's own records, narrowed to what the page draws.
 *
 * A rule comes in two kinds and the row says which: `worldRule` is the kind that came before ADR 0072, with its own
 * editor and its one timeline check (ADR 0033, ADR 0034); `systemRule` is a reusable rule definition, which may carry
 * a typed condition. Nothing here reads a rule's words.
 */
export type WorldLogicRuleSource = 'worldRule' | 'systemRule'

export type WorldLogicScope = 'Universe' | 'Project'

export interface WorldLogicRuleRow {
  id: string
  source: WorldLogicRuleSource
  title: string
  excerpt: string
  isExcerptShortened: boolean
  /** The rule carries the one timeline check of ADR 0034. Only a world rule ever does. */
  hasCheck: boolean
  /** The rule carries a typed condition tree. Only a rule definition ever does. */
  hasCondition: boolean
  scope: WorldLogicScope
  projectId: string | null
  createdAt: string
  updatedAt: string
}

export interface SystemSummary {
  id: string
  name: string
  excerpt: string
  isExcerptShortened: boolean
  scope: WorldLogicScope
  projectId: string | null
  ruleCount: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface SystemRuleSummary {
  id: string
  title: string
  excerpt: string
  isExcerptShortened: boolean
  scope: WorldLogicScope
  projectId: string | null
  hasCondition: boolean
  systemCount: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface SystemDetail {
  id: string
  name: string
  summary: string
  scope: WorldLogicScope
  projectId: string | null
  version: number
  createdAt: string
  updatedAt: string
  rules: SystemRuleSummary[]
}

/**
 * What checking a rule concluded. `violation` is a proven contradiction, `unknown` is a rule the stored facts cannot
 * answer, and `error` is a rule that is itself broken. An unknown is never a pass: the three stay apart everywhere,
 * in the interface as in the store (ADR 0072).
 */
export type WorldLogicFindingOutcome = 'violation' | 'unknown' | 'error'

/** A pure function of the outcome, not a confidence number: violation is high, error medium, unknown low. */
export type WorldLogicFindingSeverity = 'high' | 'medium' | 'low'

/** Where the author has got to with a finding. `resolved` is settled; the other three are live. */
export type WorldLogicFindingStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export interface WorldLogicFindingRow {
  id: string
  ruleId: string
  ruleTitle: string
  projectId: string | null
  outcome: WorldLogicFindingOutcome
  severity: WorldLogicFindingSeverity
  status: WorldLogicFindingStatus
  errorCode: string | null
  ruleVersion: number
  schemaVersion: number
  fingerprint: string
  evidenceCount: number
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

/** One record the outcome depended on: which store it came from, which row, and the part it played. */
export interface ConditionEvidenceRow {
  source: string
  id: string
  role: string
}

/** One thing that happened to a finding. `actorId` is null for what evaluation itself did. */
export interface WorldLogicFindingEventRow {
  action: string
  actorId: string | null
  note: string
  at: string
}

/**
 * One finding, whole. `rationale` is the evaluator's own trace: diagnostic text in one language, shown as the record
 * it is and never as prose written for a reader (ADR 0072, specification section 9).
 */
export interface WorldLogicFindingDetail {
  finding: WorldLogicFindingRow
  evidence: ConditionEvidenceRow[]
  rationale: string[]
  history: WorldLogicFindingEventRow[]
}

/**
 * What one sweep did. `isTruncated` is true when the rules produced more findings than one sweep records, and
 * nothing is closed in that case, so a truncated run must not be read as a complete picture.
 */
export interface WorldLogicSweepResult {
  detected: number
  created: number
  reopened: number
  persisted: number
  closed: number
  isTruncated: boolean
  evaluatedAt: string
}

export interface WorldLogicPage<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
