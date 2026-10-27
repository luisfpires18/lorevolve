import { formatChronologyPoint, isPlaced, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import {
  DateKind,
  DatePrecision,
  type DatePrecisionValue,
  type TimelineDate,
  type TimelineItem,
} from './types'

/**
 * One end of a date, down to the precision the API derived and no further, written the way this
 * universe writes years. The writing itself is the shared chronology formatter's.
 */
function formatPoint(
  chronology: Chronology,
  year: number | null,
  month: number | null,
  day: number | null,
  precision: DatePrecisionValue,
  eraId: string | null,
  monthId: string | null | undefined,
) {
  if (year === null || precision === DatePrecision.None) return ''

  const withMonth = precision !== DatePrecision.Year && (month !== null || !!monthId)
  const withDay = withMonth && precision === DatePrecision.Day && day !== null

  return formatChronologyPoint(chronology, {
    year,
    month: withMonth ? month : null,
    day: withDay ? day : null,
    eraId,
    monthId: withMonth ? monthId : null,
  })
}

/** The whole date as one readable stamp, built from the components the API sent. */
export function formatTimelineDate(date: TimelineDate, chronology: Chronology) {
  const start = formatPoint(
    chronology,
    date.startYear,
    date.startMonth,
    date.startDay,
    date.startPrecision,
    date.startEraId,
    date.startMonthId,
  )

  switch (date.kind) {
    case DateKind.Exact:
      return start
    case DateKind.Approximate:
      return start ? `c. ${start}` : ''
    case DateKind.Range: {
      const end = formatPoint(
        chronology,
        date.endYear,
        date.endMonth,
        date.endDay,
        date.endPrecision,
        date.endEraId,
        date.endMonthId,
      )
      return end ? `${start} – ${end}` : start
    }
    default:
      return 'Date unknown'
  }
}

/** A run of moments that share a year - and an era, or a free-text era label - in listing order. */
export interface YearGroup {
  /** Unique across the page, so React keeps two runs of the same year apart. */
  key: string
  /** The year and era the run stands for. What the next moment is measured against. */
  run: string
  year: number
  /** The universe's era the run is counted in, when it names eras. */
  eraId: string | null
  /** The free-text label of the plain reckoning, when one was written. */
  eraLabel: string | null
  entries: TimelineItem[]
}

/** The moments placed in time, the ones dated in no era, and the ones not placed at all. */
export interface GroupedTimeline {
  groups: YearGroup[]
  /**
   * Dated moments that are not on this universe's line: written as plain years before it named
   * its eras. The API lists them after every placed moment, and they are shown apart for the same
   * reason - nothing says which era they meant.
   */
  unreckoned: TimelineItem[]
  unplaced: TimelineItem[]
  /**
   * True when more than one free-text label is on the page of a universe that names no eras, so
   * the order cannot be trusted. Named eras are ordered by the API, so this never applies to them.
   */
  mixedEras: boolean
}

function groupKey(entry: TimelineItem) {
  return `${entry.date.startEraId ?? ''}|${entry.date.eraLabel ?? ''}|${entry.date.startYear}`
}

/**
 * Splits a page into year runs, in the order the API already sorted them.
 *
 * Runs are consecutive rather than gathered: the API decides the order, and pulling two
 * separated moments of year 3018 together would quietly rewrite it.
 */
export function groupTimeline(entries: TimelineItem[], chronology: Chronology): GroupedTimeline {
  const groups: YearGroup[] = []
  const unreckoned: TimelineItem[] = []
  const unplaced: TimelineItem[] = []
  const labels = new Set<string | null>()

  for (const entry of entries) {
    if (entry.date.kind === DateKind.Unknown || entry.date.startYear === null) {
      unplaced.push(entry)
      continue
    }

    if (!isPlaced(chronology, entry.date.startEraId)) {
      unreckoned.push(entry)
      continue
    }

    labels.add(entry.date.eraLabel)

    const run = groupKey(entry)
    const open = groups.at(-1)

    if (open && open.run === run) {
      open.entries.push(entry)
    } else {
      groups.push({
        key: `${run}|${groups.length}`,
        run,
        year: entry.date.startYear,
        eraId: entry.date.startEraId,
        eraLabel: entry.date.eraLabel,
        entries: [entry],
      })
    }
  }

  return { groups, unreckoned, unplaced, mixedEras: !namesEras(chronology) && labels.size > 1 }
}
