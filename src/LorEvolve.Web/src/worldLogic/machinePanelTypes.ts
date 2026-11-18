import type { Point } from './machine'
import type { SystemRuleSummary } from './types'

export const SYSTEM_CHANGED = 'system_changed'
export const SYSTEM_RULE_CHANGED = 'system_rule_changed'

export type Open =
  | { kind: 'state'; id: string; place?: undefined }
  | { kind: 'state'; id: null; place: Point }
  | { kind: 'transition'; id: string | null }
  | { kind: 'binding' }
  | null

/** Refusals by where they belong: an item's id, or `binding`, then the property the API named ('' for the item). */
export type Errors = Record<string, Record<string, string>>

export type Rules = SystemRuleSummary[] | 'failed' | null

export const m = 'canon.worldLogic.systems.machine'
export const gb = `${m}.guardBuilder` as const
