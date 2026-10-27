import {
  EraLabelPosition,
  type Chronology,
  type ChronologyCalendarMonth,
  type ChronologyEra,
  type EraLabelPositionValue,
  type EraWriting,
} from './types'

/**
 * The one place the client writes a year out. Timeline stamps and headings, a birth year on an
 * entry and an old version in its history all come through here, so a universe's dates read the
 * same way everywhere and "{year} {period}" is never assembled by hand.
 *
 * Authors see "date periods"; the code and the API keep the original name, era (ADR 0022, amended
 * by refinement 018). One is the other: a named stretch of the timeline with its own year numbers.
 *
 * It follows the API's `UniverseChronology.FormatYear`: the period's short label, or its name when
 * there is none, on the side of the year the period asks for. Nothing here orders anything - the
 * API sorts, and the client never compares formatted dates.
 */

/** True once the author has named at least one era. */
export function namesEras(chronology: Chronology) {
  return chronology.eras.length > 0
}

export function findEra(
  chronology: Chronology,
  eraId: string | null | undefined,
): ChronologyEra | null {
  if (!eraId) return null
  return chronology.eras.find((era) => era.id === eraId) ?? null
}

/** True when the universe divides its years with a custom calendar rather than numeric months. */
export function hasCalendar(chronology: Chronology) {
  return chronology.calendar !== null && chronology.calendar !== undefined
}

export function findMonth(
  chronology: Chronology,
  monthId: string | null | undefined,
): ChronologyCalendarMonth | null {
  if (!monthId) return null
  return chronology.calendar?.months.find((month) => month.id === monthId) ?? null
}

/** What is written beside a year: the short label, or the full name when there is none. */
export function eraLabel(era: Pick<EraWriting, 'name' | 'abbreviation'>) {
  return era.abbreviation ?? era.name
}

/**
 * A plain signed year. A negative one gets a real minus sign, not a hyphen, so a span reads
 * "−42 – −30" rather than dissolving into a row of dashes.
 */
export function formatSignedYear(year: number) {
  return year < 0 ? `−${Math.abs(year)}` : String(year)
}

/**
 * A date's text with an era label on the side its era asks for. Low level: reach for it directly
 * only where all that is left of an era is a remembered label, as in an old version whose era
 * has since been removed.
 */
export function withEraLabel(text: string, label: string, position: EraLabelPositionValue) {
  return position === EraLabelPosition.AfterYear ? `${text} ${label}` : `${label} ${text}`
}

/**
 * Whether a stored year is on this universe's line at all: a plain year on a universe with no
 * eras, or a year in one of its eras. A year written before the eras existed is neither, and the
 * client shows it apart rather than guessing which era it meant.
 */
export function isPlaced(chronology: Chronology, eraId: string | null) {
  return namesEras(chronology) ? findEra(chronology, eraId) !== null : eraId === null
}

/** A year the way this universe writes it: "3441", "−42", "BF 10", "10 Third Age". */
export function formatChronologyYear(chronology: Chronology, year: number, eraId: string | null) {
  return formatChronologyPoint(chronology, { year, month: null, day: null, eraId })
}

/** One point on a universe's line, down to whatever it states. */
export interface ChronologyPointParts {
  year: number
  month: number | null
  day: number | null
  eraId: string | null
  /** A custom calendar's month, in place of `month`. */
  monthId?: string | null
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/**
 * A point. On simple dates, largest part first: `3018`, `3018.09`, `BF 10.09.22`. Month and day
 * stay numeric there on purpose: naming month 9 "September" would invent a Gregorian fact the API
 * never claimed.
 *
 * On a custom calendar the author named the months, so the date reads the way they wrote it: day
 * and month name, then the year as this universe writes it - `17 Emberrise · TA 401`,
 * `Emberrise · TA 401`. The month is found by id in the calendar read with the chronology, so a
 * rename shows everywhere at once.
 */
export function formatChronologyPoint(chronology: Chronology, point: ChronologyPointParts): string {
  const custom = findMonth(chronology, point.monthId)
  if (custom) {
    const year = formatChronologyPoint(chronology, {
      year: point.year,
      month: null,
      day: null,
      eraId: point.eraId,
    })
    return `${point.day !== null ? `${point.day} ${custom.name}` : custom.name} · ${year}`
  }

  let text = formatSignedYear(point.year)
  if (point.month !== null) {
    text += `.${pad(point.month)}`
    if (point.day !== null) text += `.${pad(point.day)}`
  }

  const era = findEra(chronology, point.eraId)
  return era ? withEraLabel(text, eraLabel(era), era.labelPosition) : text
}
