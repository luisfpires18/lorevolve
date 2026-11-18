import { t, tn, tx } from '../i18n'
import {
  AgeOrder,
  FAMILY_SEMANTIC_WORDS,
  FamilySemantic,
  isParentSemantic,
  type FamilySemanticValue,
  type RelationshipCanonConstraints,
  type RelationshipType,
} from './types'

/** What a kind means to the Family Tree, in words, or null when it means nothing to it. */
export function familySummary(familySemantic: FamilySemanticValue) {
  if (familySemantic === FamilySemantic.None) return null
  return isParentSemantic(familySemantic)
    ? t('relationships.types.familyParent', { word: FAMILY_SEMANTIC_WORDS[familySemantic] })
    : t('relationships.types.familyListed')
}

/** How a type reads from each side, in the author's own words. */
export function reading(type: RelationshipType) {
  return type.isSymmetric
    ? tx('relationships.types.bothWays', { name: <bdi>{type.name}</bdi> })
    : tx('relationships.types.oneWay', {
        name: <bdi>{type.name}</bdi>,
        inverse: <bdi>{type.inverseName ?? type.name}</bdi>,
      })
}

export function years(count: number) {
  return tn('relationships.types.years', count, { n: count })
}

/** What a kind's Canon constraints say, in words, or null when it has none. */
export function constraintSummary(constraints: RelationshipCanonConstraints) {
  const parts: string[] = []

  if (constraints.ageOrder === AgeOrder.SourceOlder)
    parts.push(t('relationships.types.sourceOlder'))
  if (constraints.ageOrder === AgeOrder.SourceYounger)
    parts.push(t('relationships.types.sourceYounger'))

  const min = constraints.minAgeDifferenceYears
  const max = constraints.maxAgeDifferenceYears

  if (min !== null && max !== null) {
    parts.push(
      min === max
        ? t('relationships.types.bornExactly', { years: years(min) })
        : t('relationships.types.bornRange', { min, max }),
    )
  } else if (min !== null) {
    parts.push(t('relationships.types.bornAtLeast', { years: years(min) }))
  } else if (max !== null) {
    parts.push(t('relationships.types.bornAtMost', { years: years(max) }))
  }

  return parts.length > 0
    ? t('relationships.types.canonSummary', { parts: parts.join(', ') })
    : null
}
