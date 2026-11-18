import { t, tn } from '../i18n'
import type { ValidationTerm } from './types'

export function usage(term: ValidationTerm) {
  if (term.ruleCount === 0 && term.momentCount === 0) return t('canon.terms.notUsed')
  const rules = tn('canon.terms.rules', term.ruleCount, { n: term.ruleCount })
  const moments = tn('canon.terms.moments', term.momentCount, { n: term.momentCount })
  if (term.momentCount === 0) return t('canon.terms.usedByRules', { rules })
  if (term.ruleCount === 0) return t('canon.terms.usedByMoments', { moments })
  return t('canon.terms.usedByBoth', { rules, moments })
}
