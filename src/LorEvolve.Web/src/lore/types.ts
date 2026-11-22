import type { FieldFilter } from './fieldFilters'
import type { ImageCrop } from '../lib/imageCrop'
import { t } from '../i18n'
import type { FieldKindValue } from './fieldKinds'

/** Mirrors the backend enum. Ordered from least to most committed. */
export const CanonStatus = {
  Idea: 0,
  Draft: 1,
  Canon: 2,
} as const

export type CanonStatusValue = (typeof CanonStatus)[keyof typeof CanonStatus]

/** Getters, so each word is looked up in the current language when read, never frozen at import. */
export const CANON_LABELS: Record<CanonStatusValue, string> = {
  get [CanonStatus.Idea]() {
    return t('entityTypes.status.idea')
  },
  get [CanonStatus.Draft]() {
    return t('entityTypes.status.draft')
  },
  get [CanonStatus.Canon]() {
    return t('entityTypes.status.canon')
  },
}

/** A status's stable key: what a test id or an address is built from, never the translated word. */
export const CANON_KEYS: Record<CanonStatusValue, string> = {
  [CanonStatus.Idea]: 'idea',
  [CanonStatus.Draft]: 'draft',
  [CanonStatus.Canon]: 'canon',
}

export const CANON_ORDER: CanonStatusValue[] = [
  CanonStatus.Idea,
  CanonStatus.Draft,
  CanonStatus.Canon,
]

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
  /** Whether a fitted display copy exists; false for a picture stored before display copies, so the original is drawn. */
  hasDisplay: boolean
}

/**
 * The one picture an Image field holds on one entry. Like `EntityImageRef` it names the picture, never a URL: the address
 * is composed by `fieldImageUrl`. `cropId` names the cropped copy, so a new framing is a new address.
 */
export interface FieldImageRef {
  fieldId: string
  assetId: string
  cropId: string
  width: number
  height: number
  crop: EntityImageCrop | null
  fileName: string | null
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
  fieldImages: FieldImageRef[]
  createdAt: string
  /** A live family link touches it, so its tree stays reachable whatever its type (ADR 0040). */
  hasFamilyConnections: boolean
  /** What the entry form's save names as the version it was written over (ADR 0043). */
  version: number
  /** It has eras (Issue #30), read on their own route. */
  hasProgression: boolean
  /** A project entry's Lore entry, which its save sends back (#551). */
  canonEntityId?: string | null
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
  /** With `search`: only entries named it, by name or alias, whole and ignoring case - not ones that mention it. */
  exact?: boolean
  /** With `search`: every word in the name or an alias, never only in the summary or article. What a picker asks. */
  namesOnly?: boolean
  /** The order. Absent is the best match while searching, else the most recently edited first. */
  sort?: EntitySort | null
}

/** The orders the entry list can be read in. */
export type EntitySort = 'updated' | 'name' | 'created'
