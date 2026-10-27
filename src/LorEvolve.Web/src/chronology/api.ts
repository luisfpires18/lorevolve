import { apiFetch } from '../lib/api'
import type { Chronology, ChronologyCalendarMonthInput, ChronologyInput } from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/chronology`
}

export function getChronology(universeId: string, signal?: AbortSignal) {
  return apiFetch<Chronology>(base(universeId), { signal })
}

/** Replaces the reckoning whole. Gated: a change that contradicts settled canon is refused. */
export function saveChronology(universeId: string, input: ChronologyInput) {
  return apiFetch<Chronology>(base(universeId), { method: 'PUT', body: JSON.stringify(input) })
}

/**
 * Turns a custom calendar on, converting every simple date by position, or replaces its months whole. Refused, with what to
 * fix, when a date would no longer fit.
 */
export function saveCalendar(universeId: string, months: ChronologyCalendarMonthInput[]) {
  return apiFetch<Chronology>(`${base(universeId)}/calendar`, {
    method: 'PUT',
    body: JSON.stringify({ months }),
  })
}

/** Back to simple dates: each month becomes the number of its place. Refused while a date could not be written that way. */
export function removeCalendar(universeId: string) {
  return apiFetch<Chronology>(`${base(universeId)}/calendar`, { method: 'DELETE' })
}
