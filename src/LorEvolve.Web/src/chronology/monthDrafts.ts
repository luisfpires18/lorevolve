import type { ChronologyCalendar, ChronologyCalendarMonthInput } from './types'
import { t, tn } from '../i18n'

export type Mode = 'simple' | 'custom'

/** One month as it is being edited. Days stay text until sent, so an emptied box is empty rather than zero. */
export interface MonthDraft {
  /** Stable across reordering, so React keeps each row's inputs with its month. */
  key: string
  id: string | null
  name: string
  abbreviation: string
  days: string
  useCount: number
  maxDayUsed: number | null
}

export function draftsFrom(calendar: ChronologyCalendar | null): MonthDraft[] {
  return (calendar?.months ?? []).map((month) => ({
    key: month.id,
    id: month.id,
    name: month.name,
    abbreviation: month.abbreviation ?? '',
    days: String(month.dayCount),
    useCount: month.useCount,
    maxDayUsed: month.maxDayUsed,
  }))
}

export function inputOf(drafts: MonthDraft[]): ChronologyCalendarMonthInput[] {
  return drafts.map((month) => ({
    id: month.id,
    name: month.name.trim(),
    abbreviation: month.abbreviation.trim() || null,
    dayCount: Number(month.days.trim() || 0),
  }))
}

/** Said only when it matters: a new month, or one dates still use. A saved month nothing uses needs no line of its own. */
export function usageOf(month: MonthDraft) {
  if (!month.id) return t('time.calendar.usage.new')
  if (month.useCount === 0) return null
  const dates = tn('time.calendar.usage.dates', month.useCount, { n: month.useCount })
  return month.maxDayUsed
    ? t('time.calendar.usage.upToDay', { dates, day: month.maxDayUsed })
    : dates
}
