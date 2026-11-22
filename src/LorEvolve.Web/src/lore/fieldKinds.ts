import { t } from '../i18n'

/** Mirrors the backend enum. */
export const FieldKind = {
  ShortText: 0,
  LongText: 1,
  Number: 2,
  Boolean: 3,
  Date: 4,
  Select: 5,
  MultiSelect: 6,
  EntityReference: 7,
  Image: 8,
} as const

export type FieldKindValue = (typeof FieldKind)[keyof typeof FieldKind]

export const FIELD_KIND_LABELS: Record<FieldKindValue, string> = {
  get [FieldKind.ShortText]() {
    return t('entityTypes.kind.shortText')
  },
  get [FieldKind.LongText]() {
    return t('entityTypes.kind.longText')
  },
  get [FieldKind.Number]() {
    return t('entityTypes.kind.number')
  },
  get [FieldKind.Boolean]() {
    return t('entityTypes.kind.boolean')
  },
  get [FieldKind.Date]() {
    return t('entityTypes.kind.date')
  },
  get [FieldKind.Select]() {
    return t('entityTypes.kind.select')
  },
  get [FieldKind.MultiSelect]() {
    return t('entityTypes.kind.multiSelect')
  },
  get [FieldKind.EntityReference]() {
    return t('entityTypes.kind.entityReference')
  },
  get [FieldKind.Image]() {
    return t('entityTypes.kind.image')
  },
}

/** Mirrors the backend enum: the frame an Image field's picture is cropped to. Free keeps the picture's own ratio. */
export const FieldImageShape = {
  Free: 0,
  Square: 1,
  FourByThree: 2,
  SixteenByNine: 3,
} as const

export type FieldImageShapeValue = (typeof FieldImageShape)[keyof typeof FieldImageShape]

export const FIELD_IMAGE_SHAPE_ORDER: FieldImageShapeValue[] = [
  FieldImageShape.Free,
  FieldImageShape.Square,
  FieldImageShape.FourByThree,
  FieldImageShape.SixteenByNine,
]

export const FIELD_IMAGE_SHAPE_LABELS: Record<FieldImageShapeValue, string> = {
  get [FieldImageShape.Free]() {
    return t('entityTypes.imageShape.free')
  },
  get [FieldImageShape.Square]() {
    return t('entityTypes.imageShape.square')
  },
  get [FieldImageShape.FourByThree]() {
    return t('entityTypes.imageShape.fourByThree')
  },
  get [FieldImageShape.SixteenByNine]() {
    return t('entityTypes.imageShape.sixteenByNine')
  },
}

/** The frame's width over its height, or null for Free, which takes the picked picture's own ratio. */
export function aspectOfShape(shape: FieldImageShapeValue | null | undefined): number | null {
  switch (shape) {
    case FieldImageShape.Square:
      return 1
    case FieldImageShape.FourByThree:
      return 4 / 3
    case FieldImageShape.SixteenByNine:
      return 16 / 9
    default:
      return null
  }
}

/**
 * Mirrors the backend enum. What a field *means*, for the few meanings Canon Integrity can
 * reason about. Null is the normal case: an ordinary field means nothing to LorEvolve, and
 * nothing is ever inferred from a field's name - ADR 0011.
 */
export const FieldSemantic = {
  BirthYear: 1,
  DeathYear: 2,
  Age: 3,
} as const

export type FieldSemanticValue = (typeof FieldSemantic)[keyof typeof FieldSemantic]

export const FIELD_SEMANTIC_LABELS: Record<FieldSemanticValue, string> = {
  get [FieldSemantic.BirthYear]() {
    return t('entityTypes.semantic.birthYear')
  },
  get [FieldSemantic.DeathYear]() {
    return t('entityTypes.semantic.deathYear')
  },
  get [FieldSemantic.Age]() {
    return t('entityTypes.semantic.age')
  },
}

/** The order the meanings are offered in: the two a rule reads today, then the one it does not. */
export const FIELD_SEMANTIC_ORDER: FieldSemanticValue[] = [
  FieldSemantic.BirthYear,
  FieldSemantic.DeathYear,
  FieldSemantic.Age,
]

/**
 * Which kinds may carry each meaning. Mirrors `LoreValidation.IsSemanticCompatible`, and
 * like it this is written per meaning rather than as one rule about Number, because the
 * next meaning added will not be a year. The API validates it again regardless.
 */
const SEMANTIC_KINDS: Record<FieldSemanticValue, FieldKindValue[]> = {
  [FieldSemantic.BirthYear]: [FieldKind.Number],
  [FieldSemantic.DeathYear]: [FieldKind.Number],
  [FieldSemantic.Age]: [FieldKind.Number],
}

/** The meanings a field of this kind may be given. Empty for every kind that may carry none. */
export function semanticsFor(kind: FieldKindValue): FieldSemanticValue[] {
  return FIELD_SEMANTIC_ORDER.filter((semantic) => SEMANTIC_KINDS[semantic].includes(kind))
}

/** True for the meanings that are years a chronology rule places on the universe's line. */
export function isYearMeaning(semantic: FieldSemanticValue | null) {
  return semantic === FieldSemantic.BirthYear || semantic === FieldSemantic.DeathYear
}
