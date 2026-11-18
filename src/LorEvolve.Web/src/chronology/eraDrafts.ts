import {
  EraDirection,
  type Chronology,
  type ChronologyInput,
  type EraDirectionValue,
  type EraLabelPositionValue,
} from './types'
import { t, tn } from '../i18n'

/**
 * One date period as it is being edited. Text stays text until it is sent; counts ride along for display.
 *
 * Authors see "date periods"; the API, the tables and the backup still say era (ADR 0022, amended by refinement 018),
 * so the wire shape and the test ids keep that name.
 */
export interface EraDraft {
  /** Stable across reordering, so React keeps each row's inputs with its period. */
  key: string
  id: string | null
  name: string
  abbreviation: string
  direction: EraDirectionValue
  labelPosition: EraLabelPositionValue
  momentCount: number
  yearCount: number
  sceneCount: number
  entryEraCount: number
  periodCount: number
}

export function draftsFrom(chronology: Chronology): EraDraft[] {
  return chronology.eras.map((era) => ({
    key: era.id,
    id: era.id,
    name: era.name,
    abbreviation: era.abbreviation ?? '',
    direction: era.direction,
    labelPosition: era.labelPosition,
    momentCount: era.momentCount,
    yearCount: era.yearCount,
    sceneCount: era.sceneCount,
    entryEraCount: era.entryEraCount,
    periodCount: era.periodCount,
  }))
}

export function inputOf(drafts: EraDraft[]): ChronologyInput {
  return {
    eras: drafts.map((era) => ({
      id: era.id,
      name: era.name.trim(),
      abbreviation: era.abbreviation.trim() || null,
      direction: era.direction,
      labelPosition: era.labelPosition,
    })),
  }
}

export function joinAnd(parts: string[]) {
  return parts.join(t('time.periods.and'))
}

export function usageOf(era: EraDraft) {
  const parts: string[] = []
  if (era.momentCount > 0)
    parts.push(tn('time.periods.counts.moments', era.momentCount, { n: era.momentCount }))
  if (era.yearCount > 0)
    parts.push(tn('time.periods.counts.years', era.yearCount, { n: era.yearCount }))
  if (era.sceneCount > 0)
    parts.push(tn('time.periods.counts.scenes', era.sceneCount, { n: era.sceneCount }))
  if (era.entryEraCount > 0)
    parts.push(tn('time.periods.counts.entryEras', era.entryEraCount, { n: era.entryEraCount }))
  if (era.periodCount > 0)
    parts.push(tn('time.periods.counts.periods', era.periodCount, { n: era.periodCount }))
  return parts.length === 0 ? null : t('time.periods.usage', { list: joinAnd(parts) })
}

export const DIRECTIONS: { value: EraDirectionValue; label: () => string; testId: string }[] = [
  { value: EraDirection.Ascending, label: () => t('time.periods.up'), testId: 'era-direction-up' },
  {
    value: EraDirection.Descending,
    label: () => t('time.periods.down'),
    testId: 'era-direction-down',
  },
]
