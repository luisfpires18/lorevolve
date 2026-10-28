import {
  WorldRuleValidationKind,
  type WorldRuleValidation,
  type WorldRuleValidationInput,
  type WorldRuleValidationKindValue,
} from './types'

/** A rule's check as the author is editing it. Every number is text, so an empty box stays empty. */
export interface CheckDraft {
  kind: WorldRuleValidationKindValue
  eventKindId: string
  methodId: string
  maxOccurrences: string
}

export const NO_CHECK: CheckDraft = {
  kind: WorldRuleValidationKind.None,
  eventKindId: '',
  methodId: '',
  maxOccurrences: '1',
}

export function checkDraftFrom(validation: WorldRuleValidation | null): CheckDraft {
  return validation
    ? {
        kind: validation.kind,
        eventKindId: validation.eventKind.id,
        methodId: validation.method.id,
        maxOccurrences: String(validation.maxOccurrences),
      }
    : NO_CHECK
}

/** Two drafts that would save the same check. With no check, the parts left behind do not matter. */
export function sameCheck(a: CheckDraft, b: CheckDraft) {
  if (a.kind !== b.kind) return false
  if (a.kind === WorldRuleValidationKind.None) return true
  return (
    a.eventKindId === b.eventKindId &&
    a.methodId === b.methodId &&
    a.maxOccurrences.trim() === b.maxOccurrences.trim()
  )
}

/** What a save sends. Anything unreadable in the limit is sent as none, and the API says what it needs. */
export function checkInput(draft: CheckDraft): WorldRuleValidationInput {
  if (draft.kind === WorldRuleValidationKind.None) {
    return {
      kind: WorldRuleValidationKind.None,
      eventKindId: null,
      methodId: null,
      maxOccurrences: null,
    }
  }

  const text = draft.maxOccurrences.trim()
  const max = text === '' ? Number.NaN : Number(text)

  return {
    kind: draft.kind,
    eventKindId: draft.eventKindId || null,
    methodId: draft.methodId || null,
    maxOccurrences: Number.isInteger(max) ? max : null,
  }
}

/** The field error keys a check's refusal carries, as the API client lowercases them. */
export const CHECK_ERROR_KEYS = {
  kind: 'validation.kind',
  eventKind: 'validation.eventkindid',
  method: 'validation.methodid',
  max: 'validation.maxoccurrences',
} as const
