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

export interface WorldLogicPage<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
