import type { CanonStatusValue, FieldSemanticValue } from '../lore/types'
import type { TimelineValidation, TimelineValidationInput } from '../ruleValidation/types'

/** Mirrors the backend enum. What a moment actually claims about when it happened. */
export const DateKind = {
  Exact: 0,
  Approximate: 1,
  Range: 2,
  Unknown: 3,
} as const

export type DateKindValue = (typeof DateKind)[keyof typeof DateKind]

export const DATE_KIND_LABELS: Record<DateKindValue, string> = {
  [DateKind.Exact]: 'Exact',
  [DateKind.Approximate]: 'Approximate',
  [DateKind.Range]: 'Range',
  [DateKind.Unknown]: 'Unknown',
}

export const DATE_KIND_ORDER: DateKindValue[] = [
  DateKind.Exact,
  DateKind.Approximate,
  DateKind.Range,
  DateKind.Unknown,
]

/** What each kind promises the author, in the author's own words. */
export const DATE_KIND_HINTS: Record<DateKindValue, string> = {
  [DateKind.Exact]: 'A day, month or year you are sure of.',
  [DateKind.Approximate]: 'Around then. Shown with a “c.” in front.',
  [DateKind.Range]: 'A span, from one point to another.',
  [DateKind.Unknown]: 'In the story, but not yet placed in time.',
}

/** Mirrors the backend enum. How far down a set of components goes. Derived, never sent. */
export const DatePrecision = {
  None: 0,
  Year: 1,
  Month: 2,
  Day: 3,
} as const

export type DatePrecisionValue = (typeof DatePrecision)[keyof typeof DatePrecision]

/**
 * The chronology as numbers. Never a string the client has to parse back apart.
 *
 * `startEraId` and `endEraId` name the universe's era each year is counted in, and are null on
 * a universe that keeps plain signed years - where `eraLabel` is the free-text label instead.
 */
export interface TimelineDate {
  kind: DateKindValue
  startYear: number | null
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endMonth: number | null
  endDay: number | null
  eraLabel: string | null
  startPrecision: DatePrecisionValue
  endPrecision: DatePrecisionValue
  startEraId: string | null
  endEraId: string | null
  /** The custom calendar's months, by id, in place of the numeric months on a universe that has one. */
  startMonthId?: string | null
  endMonthId?: string | null
}

/** One entity taking part, resolved by the API so a moment renders in one request. */
export interface TimelineEntityLink {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue

  /**
   * The participant is in the Trash. Still reported, because the form posts a moment's whole
   * participant set back on every save and dropping it here would delete the participation.
   * Shown as unavailable and not linked; it becomes ordinary again when the entry is restored.
   */
  isTrashed: boolean
}

export interface TimelineEntry {
  id: string
  title: string
  description: string | null
  canonStatus: CanonStatusValue
  date: TimelineDate
  entities: TimelineEntityLink[]
  createdAt: string
  updatedAt: string

  /** The optional details World Rule checks read, or null for an ordinary moment (ADR 0034). */
  validation: TimelineValidation | null

  /** The stories this moment is linked to, by title. A story in the Trash is still listed, marked, and sent back on save. */
  stories: TimelineStoryLink[]
}

export interface TimelineStoryLink {
  storyId: string
  title: string
  isTrashed: boolean
}

/** Everything a client may set. Matches the backend's explicit request record. */
export interface TimelineEntryInput {
  title: string
  description: string | null
  canonStatus: CanonStatusValue
  dateKind: DateKindValue
  startYear: number | null
  startMonth: number | null
  startDay: number | null
  endYear: number | null
  endMonth: number | null
  endDay: number | null
  eraLabel: string | null
  entityIds: string[]
  startEraId: string | null
  endEraId: string | null
  /** A custom calendar's months, in place of the numeric months. */
  startMonthId?: string | null
  endMonthId?: string | null

  /** Left out, a save keeps the stored details; all three parts null removes them. */
  validation?: TimelineValidationInput

  /** The whole set of linked stories. Left out, a save keeps what is stored; an empty list clears it. */
  storyIds?: string[]
}

/** Mirrors the backend enum. Where an item on the timeline comes from; only a moment is stored on the timeline itself. */
export const TimelineSource = {
  Event: 0,
  Scene: 1,
  LoreFact: 2,
} as const

export type TimelineSourceValue = (typeof TimelineSource)[keyof typeof TimelineSource]

/** A dated scene's place in its story, read from the story every time. Never its prose. */
export interface TimelineSceneSource {
  storyId: string
  storyTitle: string
  chapterId: string | null
  /** The chapter's position, from 1; null when the scene is Unchaptered. */
  chapterNumber: number | null
  chapterTitle: string | null
  /** The first live beat that names the scene, for opening the Plot at it; null when none does. */
  plotBeatId: string | null
  plotBeatCount: number
}

/** A birth or death year, read from the entry every time. The status is the entry's own. */
export interface TimelineLoreFactSource {
  entityId: string
  fact: FieldSemanticValue
  canonStatus: CanonStatusValue
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
}

/**
 * One item of the unified timeline. `sourceKind` and `sourceId` together are its identity - ids of different sources are
 * never compared - and exactly one of `event`, `scene` and `loreFact` is set, matching the kind.
 */
export interface TimelineItem {
  sourceKind: TimelineSourceValue
  sourceId: string
  title: string
  date: TimelineDate
  event: TimelineEntry | null
  scene: TimelineSceneSource | null
  loreFact: TimelineLoreFactSource | null
}

export interface TimelineItemPage {
  items: TimelineItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** The unified timeline's filters, every one of them kept in the address. */
export interface TimelineItemQuery {
  source: TimelineSourceValue | null
  storyId: string | null
  canonStatus: CanonStatusValue | null
  entityId: string | null
  search: string
  page: number
}
