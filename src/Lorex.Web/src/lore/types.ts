import type { FieldFilter } from './fieldFilters'
import type { ImageCrop } from '../lib/imageCrop'

/** Mirrors the backend enum. Ordered from least to most committed. */
export const CanonStatus = {
  Idea: 0,
  Draft: 1,
  Canon: 2,
} as const

export type CanonStatusValue = (typeof CanonStatus)[keyof typeof CanonStatus]

export const CANON_LABELS: Record<CanonStatusValue, string> = {
  [CanonStatus.Idea]: 'Idea',
  [CanonStatus.Draft]: 'Draft',
  [CanonStatus.Canon]: 'Canon',
}

export const CANON_ORDER: CanonStatusValue[] = [
  CanonStatus.Idea,
  CanonStatus.Draft,
  CanonStatus.Canon,
]

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
} as const

export type FieldKindValue = (typeof FieldKind)[keyof typeof FieldKind]

export const FIELD_KIND_LABELS: Record<FieldKindValue, string> = {
  [FieldKind.ShortText]: 'Short text',
  [FieldKind.LongText]: 'Long text',
  [FieldKind.Number]: 'Number',
  [FieldKind.Boolean]: 'Yes or no',
  [FieldKind.Date]: 'Date',
  [FieldKind.Select]: 'Choose one',
  [FieldKind.MultiSelect]: 'Choose several',
  [FieldKind.EntityReference]: 'Link to an entity',
}

/**
 * Mirrors the backend enum. What a field *means*, for the few meanings Canon Integrity can
 * reason about. Null is the normal case: an ordinary field means nothing to Lorex, and
 * nothing is ever inferred from a field's name - ADR 0011.
 */
export const FieldSemantic = {
  BirthYear: 1,
  DeathYear: 2,
  Age: 3,
} as const

export type FieldSemanticValue = (typeof FieldSemantic)[keyof typeof FieldSemantic]

export const FIELD_SEMANTIC_LABELS: Record<FieldSemanticValue, string> = {
  [FieldSemantic.BirthYear]: 'Birth year',
  [FieldSemantic.DeathYear]: 'Death year',
  [FieldSemantic.Age]: 'Age',
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

export interface FieldOption {
  id: string
  value: string
  displayOrder: number
}

export interface FieldDefinition {
  id: string
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number
  defaultValue: string | null
  options: FieldOption[]
  semantic: FieldSemanticValue | null
  /**
   * For a link to an entity: the one type its entries must be of, exactly that type, by id. Null means any Lore type, an
   * explicit choice. Always null for every other kind. Never worked out from a name.
   */
  targetEntityTypeId: string | null
  /**
   * For a link to an entity: the semantic group its entries' types must be in, by id, or null. Never set beside
   * `targetEntityTypeId`. Read by its membership as it is now, never by the group's name.
   */
  targetGroupId: string | null
  /**
   * When the field was archived, or null while it is active (Issue #39). An archived field keeps everything - its values,
   * options, meaning, limit and `isRequired` - and is out of every form, read and filter until it is restored.
   */
  archivedAt: string | null
  /** How many entries hold a value for this field, the Trash included. A field with any is archived, never deleted. */
  entryCount: number
  /** How many of those entries are in the Trash. */
  trashedEntryCount: number
  /** Whether an older version of any entry recorded a value for it: that keeps it from being deleted too. */
  usedInHistory: boolean
  /** The definition's edit version, which an edit names as `expectedVersion` (ADR 0043). */
  version: number
}

/**
 * A semantic group of Lore types (Issue #36): a creator's own classification - Runes, say - that several concrete types can
 * belong to. Classification only: nothing is inherited. Being in a group offers the Family Tree only when the author has
 * enabled the group for it (`familyTreeEnabled`, Issue #37).
 */
export interface EntityTypeGroup {
  id: string
  name: string
  /** The member types' ids, in no meaningful order. */
  typeIds: string[]
  /** The author enabled this group for the Family Tree: every type in it is offered there. Never set by a name. */
  familyTreeEnabled: boolean
}

export interface EntityType {
  id: string
  name: string
  description: string | null
  /** The type's icon key - one of `TYPE_ICONS` - or null for the neutral fallback. */
  icon: string | null
  accentColor: string | null
  displayOrder: number
  /** Every entry of this type, the Trash included: a trashed entry keeps its type and still stops it being deleted. */
  entityCount: number
  /** How many of those are in the Trash. */
  trashedEntityCount: number
  /** The type's active fields: the ones entry forms, filters and Lore read. */
  fields: FieldDefinition[]
  /** Its archived fields (Issue #39), apart so nothing that reads `fields` can meet one by accident. */
  archivedFields: FieldDefinition[]
  /**
   * The type's own Family Tree switch, the one a save writes. Set by the author, never read from the name (ADR 0040).
   */
  familyTreeEligible: boolean
  /**
   * Whether the Family Tree is offered for this type's entries: its own switch, or a group enabled for the tree that it is in
   * (Issue #37). Worked out by the API; read only.
   */
  familyTreeOffered: boolean
  /**
   * The type this one sits beneath, or null for a root. Organisation only - nothing is inherited. A list of types arrives
   * parent before descendants, but the tree is always built from these ids (`lore/typeTree.ts`), never from positions.
   */
  parentId: string | null
}

export interface FieldValue {
  fieldDefinitionId: string
  name: string
  kind: FieldKindValue
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[]
  optionValues: string[]
  referencedEntityId: string | null
  referencedEntityName: string | null

  /**
   * The reference points at an entry that is currently in the Trash. The id and the name are
   * still sent, on purpose: this value belongs to the live entry holding it, and the client
   * posts its whole field set on every save, so hiding the reference would delete it the next
   * time an unrelated field was touched. Render it as unavailable and do not link it.
   */
  referencedEntityIsTrashed: boolean

  /** The universe's era `number` is a year in, or null for a plain number. */
  eraId: string | null
}

/** True for the meanings that are years a chronology rule places on the universe's line. */
export function isYearMeaning(semantic: FieldSemanticValue | null) {
  return semantic === FieldSemantic.BirthYear || semantic === FieldSemantic.DeathYear
}

/**
 * The entry's primary image: identity and shape, never a URL.
 *
 * The address is composed from these by `entityImageUrl` - the same derivation the API does on
 * its side - so nothing stored or sent points at Cloudflare, and moving the route means changing
 * one function rather than every payload ever written.
 *
 * `width` and `height` are the original's, as displayed, and they are what let a picture reserve
 * its space before a byte of it has arrived.
 *
 * `thumbnailId` names the thumbnail currently cut from it; a new framing is a new id, and so a new
 * address. `crop` is the square that thumbnail shows - null only for a picture stored before an
 * author could choose, whose thumbnail is the centred square.
 */
export interface EntityImageRef {
  assetId: string
  thumbnailId: string
  width: number
  height: number
  contentType: string
  fileName: string | null
  byteSize: number
  uploadedAt: string
  crop: EntityImageCrop | null
}

/**
 * The square a thumbnail is cut from. Its own name here because it is what the lore API and a
 * backup call it, and the shape itself is shared - the cropper and the server's crop arithmetic
 * are the same for an entry's portrait and an account's photo.
 */
export type EntityImageCrop = ImageCrop

/** One run of a search excerpt: plain text as the author wrote it, and whether it is part of what matched. */
export interface SearchExcerptPart {
  text: string
  isMatch: boolean
}

export interface EntitySummary {
  id: string
  name: string
  summary: string | null
  canonStatus: CanonStatusValue
  isArchived: boolean
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  aliases: string[]
  tags: string[]
  image: EntityImageRef | null
  updatedAt: string

  /**
   * A few words of the article around what a search matched, cut by the API. Only on a search result whose article
   * matched; null when browsing and when the name, an alias or the summary was the match. Text, never markup.
   */
  articleExcerpt: SearchExcerptPart[] | null
}

/** An entry's structured lore. Its article is read on its own route - see `article.ts`. */
export interface EntityDetail extends EntitySummary {
  fields: FieldValue[]
  createdAt: string
  /** A live family link touches it, so its tree stays reachable whatever its type (ADR 0040). */
  hasFamilyConnections: boolean
  /** What the entry form's save names as the version it was written over (ADR 0043). */
  version: number
  /** It has eras (Issue #30), read on their own route. */
  hasProgression: boolean
}

export interface EntityPage {
  items: EntitySummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface TagSummary {
  id: string
  name: string
  entityCount: number
}

/** What the client sends for one field. Only the member matching the kind is read. */
export interface FieldValueInput {
  fieldDefinitionId: string
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[] | null
  referencedEntityId: string | null

  /**
   * The era `number` is a year in. Required for a birth or death year on a universe that names
   * eras, allowed on any number there, and refused on a universe that names none.
   */
  eraId: string | null
}

/** The structured half of an entry. No article: that is saved on its own route, so this save can never overwrite it. */
export interface EntityInput {
  entityTypeId: string
  name: string
  summary: string | null
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: FieldValueInput[]
  /** The entry's version an edit was written over; left out on create. */
  expectedVersion?: number
}

/** One row of a mass create: only what an entry's basic shell is. */
export interface BulkEntityRow {
  entityTypeId: string
  name: string
  canonStatus: CanonStatusValue
}

export interface BulkCreatedEntity {
  id: string
  name: string
  entityTypeId: string
  canonStatus: CanonStatusValue
}

export interface EntityQuery {
  search: string
  entityTypeId: string | null
  canonStatus: CanonStatusValue | null
  tag: string | null
  page: number
  /** Entries per page; the API clamps it to 1-50. Absent is `ENTITY_PAGE_SIZE`. */
  pageSize?: number
  /** Only entries whose type is enabled for the Family Tree. */
  familyTreeEligible?: boolean
  /** Only entries whose type is in this semantic group now. Used instead of `entityTypeId`. */
  entityTypeGroupId?: string | null
  /** With `entityTypeId`: that type and every type nested beneath it - Lore's browsing. Absent is the exact type. */
  includeDescendants?: boolean
  /** With `entityTypeId`: custom-field filters on that type's own fields, all of which must hold (`lore/fieldFilters.ts`). */
  fieldFilters?: FieldFilter[]
}
