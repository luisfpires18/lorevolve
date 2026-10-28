/** Mirrors the backend enum. Which way an era's years run - configured, never read from a name. */
export const EraDirection = {
  /** Years count up from 1: "AF 1, AF 2, AF 3". */
  Ascending: 0,
  /** Years count down to 1, the one nearest the next era: "BF 3, BF 2, BF 1". */
  Descending: 1,
} as const

export type EraDirectionValue = (typeof EraDirection)[keyof typeof EraDirection]

/** Mirrors the backend enum. Where an era's label is written beside a year. Display only. */
export const EraLabelPosition = {
  BeforeYear: 0,
  AfterYear: 1,
} as const

export type EraLabelPositionValue = (typeof EraLabelPosition)[keyof typeof EraLabelPosition]

/** What an era is for display: enough to write a year in it. */
export interface EraWriting {
  name: string
  abbreviation: string | null
  labelPosition: EraLabelPositionValue
}

/** One era of a universe's reckoning, as the API reports it. */
export interface ChronologyEra extends EraWriting {
  id: string
  sortOrder: number
  direction: EraDirectionValue

  /** Timeline entries that start or end in this era, the Trash included. */
  momentCount: number

  /** Years on entries counted in this era, the Trash included. */
  yearCount: number

  /** Story scenes placed in this era. */
  sceneCount: number

  /** Progression eras of entries that start or end in this era. */
  entryEraCount: number

  /** Relationship periods that start or end in this era. */
  periodCount: number
}

/**
 * One point on a universe's line that is not a timeline moment - a scene's position. The era is
 * null on the plain reckoning. Null as a whole means not placed in time, which is ordinary.
 */
export interface ChronologyValue {
  eraId: string | null
  year: number | null
  /** The numeric month, on simple dates only. */
  month: number | null
  day: number | null
  /** The custom calendar's month, by id, on a universe that has one. Never set beside `month`. */
  monthId?: string | null
}

/** One month of a custom calendar, in the order of the year. */
export interface ChronologyCalendarMonth {
  id: string
  name: string
  abbreviation: string | null
  sortOrder: number
  dayCount: number

  /** Timeline moments and scenes dated in it, the Trash included. Any keeps it from being removed. */
  useCount: number

  /** The latest day any of them uses, so the month cannot be shortened below it. */
  maxDayUsed: number | null
}

/** How a universe's year is divided, when its author chose a custom calendar. */
export interface ChronologyCalendar {
  id: string
  months: ChronologyCalendarMonth[]
}

/** One month as the Calendar screen sends it. A null id is a new month; a missing one is removed. */
export interface ChronologyCalendarMonthInput {
  id: string | null
  name: string
  abbreviation: string | null
  dayCount: number
}

/**
 * A universe's reckoning, earliest era first. No eras is the plain reckoning of signed years
 * LorEvolve has always had - there is no separate "mode".
 */
export interface Chronology {
  eras: ChronologyEra[]

  /** Dated timeline entries with no era: on a universe with eras, off the line until given one. */
  unplacedMomentCount: number

  /** Declared birth and death years with no era, likewise. */
  unplacedYearCount: number

  /** The custom calendar, or null for simple dates: a numeric month and day. */
  calendar: ChronologyCalendar | null
}

/** One era as the Settings screen sends it. A null id is a new era; a missing one is removed. */
export interface ChronologyEraInput {
  id: string | null
  name: string
  abbreviation: string | null
  direction: EraDirectionValue
  labelPosition: EraLabelPositionValue
}

/** The whole reckoning, replaced in one write. The list order is the eras' order. */
export interface ChronologyInput {
  eras: ChronologyEraInput[]
}

/** The reckoning a universe has until its author names an era. */
export const PLAIN_CHRONOLOGY: Chronology = {
  eras: [],
  unplacedMomentCount: 0,
  unplacedYearCount: 0,
  calendar: null,
}
