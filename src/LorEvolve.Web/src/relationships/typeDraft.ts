import {
  AgeOrder,
  FamilySemantic,
  type AgeOrderValue,
  type FamilySemanticValue,
  type RelationshipType,
} from './types'

export interface TypeDraft {
  name: string
  inverseName: string
  isSymmetric: boolean
  description: string
  ageOrder: AgeOrderValue
  /** As typed, so a half-written number is never silently read as "no gap". */
  minGap: string
  maxGap: string
  familySemantic: FamilySemanticValue
}

export const BLANK: TypeDraft = {
  name: '',
  inverseName: '',
  isSymmetric: false,
  description: '',
  ageOrder: AgeOrder.None,
  minGap: '',
  maxGap: '',
  familySemantic: FamilySemantic.None,
}

/** The server's field keys, lowercased the way `ApiError` hands them over. */
export const ORDER_KEY = 'canonconstraints.ageorder'
export const MIN_KEY = 'canonconstraints.minagedifferenceyears'
export const MAX_KEY = 'canonconstraints.maxagedifferenceyears'
export const FAMILY_KEY = 'familysemantic'

export function draftFrom(type: RelationshipType): TypeDraft {
  const constraints = type.canonConstraints
  return {
    name: type.name,
    inverseName: type.inverseName ?? '',
    isSymmetric: type.isSymmetric,
    description: type.description ?? '',
    ageOrder: constraints.ageOrder,
    minGap: constraints.minAgeDifferenceYears?.toString() ?? '',
    maxGap: constraints.maxAgeDifferenceYears?.toString() ?? '',
    familySemantic: type.familySemantic,
  }
}

/** Blank is no gap; anything else must be a whole number of years, 0 or more. */
export function readGap(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 'invalid'
}
