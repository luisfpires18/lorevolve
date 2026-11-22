import { isObject, type Json } from './guard.ts'

/** A read-only block's one line: an i18n key under `guardBuilder` and its parameters. */
export function summarize(
  node: Json | undefined,
  titleOf: (ruleId: string) => string | undefined,
): { key: string; params?: Record<string, string> } {
  if (isObject(node)) {
    if (node.kind === 'within') return { key: 'summaries.within' }
    if (node.kind === 'ruleHolds') {
      const title = typeof node.ruleId === 'string' ? titleOf(node.ruleId) : undefined
      return title
        ? { key: 'summaries.ruleHolds', params: { title } }
        : { key: 'summaries.ruleHoldsUnknown' }
    }
    if (node.kind === 'always') {
      if (node.value === 'true') return { key: 'summaries.alwaysTrue' }
      if (node.value === 'false') return { key: 'summaries.alwaysFalse' }
      if (node.value === 'unknown') return { key: 'summaries.alwaysUnknown' }
    }
  }
  return { key: 'summaries.other' }
}

function canonical(value: Json | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** Whether two conditions say the same thing: key order is not meaning. */
export function sameCondition(a: Json | undefined, b: Json | undefined) {
  return canonical(a) === canonical(b)
}
