import { NO_CHECK, checkDraftFrom, sameCheck, type CheckDraft } from '../ruleValidation/checkDraft'
import type { WorldRuleCheck, WorldRuleValidation } from '../ruleValidation/types'
import type { WorldRuleDetail } from './types'
import { numberFormat } from '../i18n/format'
import type { Load } from '../lib/useAsyncRead'

/** The editor's read of its rule; what it reads goes into the stored rule and the draft, so the ready value is empty. */
export type LoadState = Load<null>

/** What an author edits. */
export interface Fields {
  title: string
  description: string
  check: CheckDraft
}

/** The rule as the API last confirmed it: what "unsaved" is measured against, what the next save names, and what its check finds. */
export interface Stored extends Fields {
  updatedAt: string | null
  validation: WorldRuleValidation | null
  found: WorldRuleCheck | null
}

export const EMPTY_STORED: Stored = {
  title: '',
  description: '',
  check: NO_CHECK,
  updatedAt: null,
  validation: null,
  found: null,
}

export const count = (value: number) => numberFormat({}, 'en').format(value)

export function sameFields(a: Fields, b: Fields) {
  return a.title === b.title && a.description === b.description && sameCheck(a.check, b.check)
}

export function fieldsOf(stored: Stored): Fields {
  return { title: stored.title, description: stored.description, check: stored.check }
}

export function storedFrom(rule: WorldRuleDetail): Stored {
  return {
    title: rule.title,
    description: rule.description,
    check: checkDraftFrom(rule.validation),
    updatedAt: rule.updatedAt,
    validation: rule.validation,
    found: rule.check,
  }
}

/** The stored moment a stale save's refusal reports, when it carries one. */
export function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}
