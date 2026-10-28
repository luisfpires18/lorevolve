/** Mirrors the backend enum. How badly a finding undermines the lore it was found in. */
export const CanonSeverity = {
  Low: 0,
  Medium: 1,
  High: 2,
} as const

export type CanonSeverityValue = (typeof CanonSeverity)[keyof typeof CanonSeverity]

export const SEVERITY_LABELS: Record<CanonSeverityValue, string> = {
  [CanonSeverity.Low]: 'Low',
  [CanonSeverity.Medium]: 'Medium',
  [CanonSeverity.High]: 'High',
}

/** Worst first, which is the order the review reads in. */
export const SEVERITY_ORDER: CanonSeverityValue[] = [
  CanonSeverity.High,
  CanonSeverity.Medium,
  CanonSeverity.Low,
]

/**
 * What each severity means for the author, in one line. Only High refuses a save, and only
 * the save that would create one - ADR 0012. Nothing here may imply otherwise.
 */
export const SEVERITY_HINTS: Record<CanonSeverityValue, string> = {
  [CanonSeverity.Low]: 'Worth a look. Never refuses anything.',
  [CanonSeverity.Medium]: 'A likely inconsistency. Reported, never blocking.',
  [CanonSeverity.High]: 'Cannot be true. A save that would create one is refused.',
}

/** Mirrors the backend enum. Where a conflict stands with its author. */
export const CanonConflictStatus = {
  Pending: 0,
  Resolved: 1,
  Dismissed: 2,
} as const

export type CanonConflictStatusValue =
  (typeof CanonConflictStatus)[keyof typeof CanonConflictStatus]

export const CONFLICT_STATUS_LABELS: Record<CanonConflictStatusValue, string> = {
  [CanonConflictStatus.Pending]: 'Open',
  [CanonConflictStatus.Resolved]: 'Resolved',
  [CanonConflictStatus.Dismissed]: 'Dismissed',
}

/** Actionable first. Resolved is evaluation's own state and reads last. */
export const CONFLICT_STATUS_ORDER: CanonConflictStatusValue[] = [
  CanonConflictStatus.Pending,
  CanonConflictStatus.Dismissed,
  CanonConflictStatus.Resolved,
]

/** Mirrors the backend enum. The kind of record a finding points at. */
export const CanonSubjectKind = {
  Entity: 0,
  Relationship: 1,
  TimelineEntry: 2,
  EntityField: 3,
  WorldRule: 4,
} as const

export type CanonSubjectKindValue = (typeof CanonSubjectKind)[keyof typeof CanonSubjectKind]

export const SUBJECT_KIND_LABELS: Record<CanonSubjectKindValue, string> = {
  [CanonSubjectKind.Entity]: 'Entry',
  [CanonSubjectKind.Relationship]: 'Relationship',
  [CanonSubjectKind.TimelineEntry]: 'Moment',
  [CanonSubjectKind.EntityField]: 'Field',
  [CanonSubjectKind.WorldRule]: 'World rule',
}

/** `name` is null when the record has gone and the universe has not been evaluated since. */
export interface CanonConflictSubject {
  kind: CanonSubjectKindValue
  subjectId: string
  role: string
  name: string | null
}

export interface CanonConflict {
  id: string
  ruleCode: string
  severity: CanonSeverityValue
  status: CanonConflictStatusValue
  title: string
  explanation: string
  subjects: CanonConflictSubject[]
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export interface CanonConflictPage {
  items: CanonConflict[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** What one evaluation run did, so the screen can say so without diffing the list. */
export interface CanonEvaluation {
  detected: number
  created: number
  reopened: number
  persisted: number
  resolved: number
  evaluatedAt: string
}

export interface CanonConflictQuery {
  severity: CanonSeverityValue | null
  status: CanonConflictStatusValue | null
  page: number
}

/** Ids only. A refused write is rolled back, so the API resolves no names for these. */
export interface CanonBlockingSubject {
  kind: CanonSubjectKindValue
  subjectId: string
  role: string
}

/** One High finding a refused write would have introduced. Carries no conflict id: none exists. */
export interface CanonBlockingFinding {
  ruleCode: string
  severity: CanonSeverityValue
  fingerprint: string
  title: string
  explanation: string
  subjects: CanonBlockingSubject[]
}
