import type { ChronologyPointDraft } from '../components/ChronologyPointFields'
import type { Chronology, ChronologyValue } from '../chronology/types'
import { formatSpan } from '../progression/eras'
import { chronologyOf, EMPTY_POINT } from '../stories/sceneDraft'
import type { RelationshipPeriod, RelationshipPeriodInput } from './types'

/** One period as it is being typed: dates, or one era of either end. `key` only tells rows apart while editing. */
export interface PeriodDraft {
  key: string
  kind: 'dates' | 'era'
  start: ChronologyPointDraft
  end: ChronologyPointDraft
  entityEraId: string
  /** How a stored era reads ("Frieza Saga (Goku)"), so it shows before - or without - the eras being read. */
  eraLabel: string | null
}

let counter = 0

export function newPeriod(): PeriodDraft {
  counter += 1
  return {
    key: `period-${counter}`,
    kind: 'dates',
    start: EMPTY_POINT,
    end: EMPTY_POINT,
    entityEraId: '',
    eraLabel: null,
  }
}

function text(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function pointDraft(value: ChronologyValue | null): ChronologyPointDraft {
  return value
    ? {
        eraId: value.eraId ?? '',
        year: text(value.year),
        month: value.monthId ?? text(value.month),
        day: text(value.day),
      }
    : EMPTY_POINT
}

export function periodDrafts(periods: RelationshipPeriod[]): PeriodDraft[] {
  return periods.map((period) => ({
    ...newPeriod(),
    kind: period.entityEraId ? 'era' : 'dates',
    start: pointDraft(period.start),
    end: pointDraft(period.end),
    entityEraId: period.entityEraId ?? '',
    eraLabel: period.entityEraId
      ? `${period.eraName ?? 'An era'}${period.eraEntityName ? ` (${period.eraEntityName})` : ''}`
      : null,
  }))
}

/** The drafts as a save sends them: an era by id, or the dates typed - nothing typed in a bound is an open bound. */
export function periodInputs(
  drafts: PeriodDraft[],
  reckonsInEras: boolean,
  custom: boolean,
): RelationshipPeriodInput[] {
  return drafts.map((draft) =>
    draft.kind === 'era'
      ? { start: null, end: null, entityEraId: draft.entityEraId || null }
      : {
          start: chronologyOf(draft.start, reckonsInEras, custom),
          end: chronologyOf(draft.end, reckonsInEras, custom),
          entityEraId: null,
        },
  )
}

/** One period in a line: "749 – 750", "From 760", or "during Frieza Saga (Goku)". */
export function periodText(period: RelationshipPeriod, chronology: Chronology) {
  if (period.entityEraId) {
    const whose = period.eraEntityName ? ` (${period.eraEntityName})` : ''
    return `During ${period.eraName ?? 'an era'}${whose}`
  }
  return formatSpan(chronology, period.start, period.end) ?? ''
}
