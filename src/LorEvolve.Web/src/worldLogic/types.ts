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

/**
 * One rule definition, whole. `condition` and `exceptions` are the stored JSON trees as they were written; the guard
 * builder edits the condition and sends the exceptions back untouched.
 */
export interface SystemRuleDetail {
  id: string
  title: string
  description: string
  scope: WorldLogicScope
  projectId: string | null
  schemaVersion: number | null
  condition: unknown
  dependsOn: string[]
  systems: { id: string; name: string }[]
  version: number
  createdAt: string
  updatedAt: string
  exceptions?: unknown
}

/** What a rule save sends. An update is whole, under `expectedVersion`; a stale one is 409 `system_rule_changed`. */
export interface SystemRuleInput {
  title: string
  description: string
  projectId: string | null
  schemaVersion?: number
  condition?: unknown
  dependsOn?: string[]
  exceptions?: unknown
  expectedVersion?: number
}

/** What evaluating one rule answered. `outcome` is the evaluator's word; nothing is stored by asking. */
export interface ConditionEvaluationResponse {
  ruleId: string
  ruleVersion: number
  schemaVersion: number
  outcome: string
  errorCode: string | null
  exemptionId: string | null
  evidence: ConditionEvidenceRow[]
  rationale: string[]
}

/** What a System save sends. `projectId` is the scope it was created in and never changes. */
export interface SystemInput {
  name: string
  summary: string
  projectId?: string | null
  expectedVersion?: number
}

export const SYSTEM_NAME_MAX_LENGTH = 200
export const SYSTEM_SUMMARY_MAX_LENGTH = 2000

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

/**
 * What a machine finding is about (#360). `stateId` is null for `undeclared_state`, and a name is null when the state
 * or the entry is no longer there.
 */
export interface WorldLogicFindingMachine {
  systemId: string
  systemName: string
  check: 'undeclared_state' | 'no_transition_holds'
  stateId: string | null
  stateName: string | null
  subjectId: string
  subjectName: string | null
}

/** A machine finding has a null rule and names its System in `machine`; there `ruleVersion` is the System's version. */
export interface WorldLogicFindingRow {
  id: string
  ruleId: string | null
  ruleTitle: string | null
  machine: WorldLogicFindingMachine | null
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

/** The API's machine limits (ADR 0073). */
export const MACHINE_MAX_STATES = 64
export const MACHINE_MAX_TRANSITIONS = 256
/** A state's name and value, a transition's label and each half of the binding. */
export const MACHINE_TEXT_MAX_LENGTH = 200

/** Which attribute of which subject type a machine's states are values of, compared as text. */
export interface SystemMachineBinding {
  subjectType: string
  attribute: string
}

/** One state. `id` is the client's own, unique within the document; `x` and `y` place it on the canvas. */
export interface SystemMachineState {
  id: string
  name: string
  value: string
  initial: boolean
  x: number
  y: number
}

/** One transition, in declared order. `guardRuleId` names a rule definition, or is null. */
export interface SystemMachineTransition {
  id: string
  fromStateId: string
  toStateId: string
  label: string | null
  guardRuleId: string | null
}

/** A System's machine, whole, with the System's version. A System with none has a null binding and empty lists. */
export interface SystemMachineDetail {
  systemId: string
  version: number
  schemaVersion: number
  binding: SystemMachineBinding | null
  states: SystemMachineState[]
  transitions: SystemMachineTransition[]
  /** Open and reviewing machine findings per state, in the System's own scope. A state with none is not listed. */
  openFindings: { stateId: string; count: number }[]
}

/** One transition's guard for one entry. An exempt rule reads `true`; `none` is a transition with no guard. */
export interface SystemMachineGuardRow {
  transitionId: string
  guard: 'true' | 'false' | 'unknown' | 'error' | 'none'
  errorCode: string | null
}

/** One record a machine check produced for the entry, as specification section 5 writes it. */
export interface SystemMachineRecordRow {
  systemId: string
  systemVersion: number
  schemaVersion: number
  check: WorldLogicFindingMachine['check']
  stateId: string | null
  subjectId: string
  outcome: WorldLogicFindingOutcome
  errorCode: string | null
  evidence: ConditionEvidenceRow[]
  rationale: string[]
}

/**
 * "Try an entry": the entry's bound value, every transition's guard for it and the records both checks produce. A null
 * `value` means the entry is outside the machine: of another type, or holding no text value for the attribute.
 */
export interface SystemMachineTryResult {
  value: string | null
  transitions: SystemMachineGuardRow[]
  records: SystemMachineRecordRow[]
}

/** What a machine save sends: the whole document, under the System's version. An empty one removes the machine. */
export interface SystemMachineInput {
  schemaVersion: number
  binding: SystemMachineBinding | null
  states: SystemMachineState[]
  transitions: SystemMachineTransition[]
  expectedVersion: number
}
