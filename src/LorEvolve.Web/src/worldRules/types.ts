import type {
  WorldRuleCheck,
  WorldRuleValidation,
  WorldRuleValidationInput,
} from '../ruleValidation/types'

/** The bounds a world rule is held to, mirrored from the API's `WorldRuleLimits` so a form says so before a save. */
export const WORLD_RULE_TITLE_MAX_LENGTH = 200
export const WORLD_RULE_DESCRIPTION_MAX_LENGTH = 10_000

/** A list row: a rule's title and the start of its description, never all of it, and whether it carries a timeline check. */
export interface WorldRuleSummary {
  id: string
  title: string
  excerpt: string
  isExcerptShortened: boolean
  createdAt: string
  updatedAt: string
  hasCheck: boolean
}

export interface WorldRulePage {
  items: WorldRuleSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/**
 * One rule, whole: what the author wrote and when. A rule's words are never read (ADR 0033). Only a rule the author gave an
 * explicit timeline check carries `validation`, and with it `check` - what counting that check finds now, derived and never
 * stored (ADR 0034). A rule that is words only carries neither.
 */
export interface WorldRuleDetail {
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
  validation: WorldRuleValidation | null
  check: WorldRuleCheck | null
}

/** A create, or a whole save naming the `updatedAt` it was written over, with the rule's check. */
export interface WorldRuleInput {
  title: string
  description: string
  expectedUpdatedAt: string | null
  validation: WorldRuleValidationInput
}
