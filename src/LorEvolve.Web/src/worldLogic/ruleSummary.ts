import type { SystemRuleDetail, SystemRuleSummary } from './types'

/** A rule's list row, from the rule itself, so a guard just saved can be chosen without reading the list again. */
export function summaryOf(rule: SystemRuleDetail): SystemRuleSummary {
  return {
    id: rule.id,
    title: rule.title,
    excerpt: '',
    isExcerptShortened: false,
    scope: rule.scope,
    projectId: rule.projectId,
    hasCondition: rule.condition !== null && rule.condition !== undefined,
    systemCount: rule.systems.length,
    version: rule.version,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }
}
