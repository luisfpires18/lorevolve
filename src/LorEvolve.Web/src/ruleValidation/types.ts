/**
 * World rule checks against the timeline (ADR 0034): a universe's event kinds and methods, a rule's one optional check, a
 * moment's optional details, and what counting a check found. Every part is an explicit id or number - nothing is read from a
 * rule's or a moment's words.
 */

/** Mirrors the backend enum. What a term names. */
export const ValidationTermKind = {
  EventKind: 0,
  Method: 1,
} as const

export type ValidationTermKindValue = (typeof ValidationTermKind)[keyof typeof ValidationTermKind]

export const TERM_KIND_ORDER: ValidationTermKindValue[] = [
  ValidationTermKind.EventKind,
  ValidationTermKind.Method,
]

/** The kind as a label, and as a word inside a sentence. */
export const TERM_KIND_LABELS: Record<ValidationTermKindValue, string> = {
  [ValidationTermKind.EventKind]: 'Event kind',
  [ValidationTermKind.Method]: 'Method',
}

export const TERM_KIND_PLURALS: Record<ValidationTermKindValue, string> = {
  [ValidationTermKind.EventKind]: 'Event kinds',
  [ValidationTermKind.Method]: 'Methods',
}

export const TERM_KIND_WORDS: Record<ValidationTermKindValue, string> = {
  [ValidationTermKind.EventKind]: 'event kind',
  [ValidationTermKind.Method]: 'method',
}

/** Mirrored from `RuleValidationLimits`. */
export const TERM_NAME_MAX_LENGTH = 80
export const MAX_OCCURRENCES_CEILING = 10_000

/** The code on the 409 for deleting a term something still names. */
export const VALIDATION_TERM_IN_USE = 'validation_term_in_use'

/** One event kind or method, with how many rules (the Trash included) and moments name it. */
export interface ValidationTerm {
  id: string
  kind: ValidationTermKindValue
  name: string
  ruleCount: number
  momentCount: number
  createdAt: string
  updatedAt: string
}

/** A term as something else names it. */
export interface TermReference {
  id: string
  name: string
}

/** Mirrors the backend enum. The one supported pattern, or none. */
export const WorldRuleValidationKind = {
  None: 0,
  MaxOccurrencesPerParticipantAndMethod: 1,
} as const

export type WorldRuleValidationKindValue =
  (typeof WorldRuleValidationKind)[keyof typeof WorldRuleValidationKind]

/** A rule's check as stored. */
export interface WorldRuleValidation {
  kind: WorldRuleValidationKindValue
  eventKind: TermReference
  method: TermReference
  maxOccurrences: number
}

/** A rule's check on a save. Kind `None` removes it. */
export interface WorldRuleValidationInput {
  kind: WorldRuleValidationKindValue
  eventKindId: string | null
  methodId: string | null
  maxOccurrences: number | null
}

/** Mirrors the backend enum. What counting a rule's check could establish. */
export const WorldRuleCheckOutcome = {
  Checked: 0,
  Incomplete: 1,
  CannotCheck: 2,
} as const

export type WorldRuleCheckOutcomeValue =
  (typeof WorldRuleCheckOutcome)[keyof typeof WorldRuleCheckOutcome]

/** Mirrors the backend enum. Why a moment that may match could not be counted. */
export const UncountedReason = {
  NoParticipant: 0,
  ParticipantInTrash: 1,
  NoEventKind: 2,
  NoMethod: 3,
} as const

export type UncountedReasonValue = (typeof UncountedReason)[keyof typeof UncountedReason]

export const UNCOUNTED_REASON_LABELS: Record<UncountedReasonValue, string> = {
  [UncountedReason.NoParticipant]: 'no participant recorded',
  [UncountedReason.ParticipantInTrash]: 'its participant is in the Trash',
  [UncountedReason.NoEventKind]: 'no event kind recorded',
  [UncountedReason.NoMethod]: 'no method recorded',
}

export interface WorldRuleUncountedMoment {
  timelineEntryId: string
  title: string
  reason: UncountedReasonValue
}

/** What a rule's check finds now. Derived when the rule is read; never stored. */
export interface WorldRuleCheck {
  outcome: WorldRuleCheckOutcomeValue
  countedMoments: number
  participantsOverLimit: number
  notCanonMoments: number
  uncountedMoments: number
  uncounted: WorldRuleUncountedMoment[]
  problem: string | null
}

/** A moment's details as stored. Each part may be absent. */
export interface TimelineValidation {
  eventKind: TermReference | null
  method: TermReference | null
  participant: { entityId: string; name: string; isTrashed: boolean } | null
}

/** A moment's details on a save. All three absent removes them. */
export interface TimelineValidationInput {
  eventKindId: string | null
  methodId: string | null
  participantEntityId: string | null
}
