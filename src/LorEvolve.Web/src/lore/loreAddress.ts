import type { Load } from '../lib/useAsyncRead'
import type { CanonStatusValue, EntityPage, EntitySort } from './types'

/** The list's read, or `idle` when no type or group is chosen yet. */
export type LoadState = Load<EntityPage> | { kind: 'idle' }

export function readStatus(value: string | null): CanonStatusValue | null {
  return value === '0' || value === '1' || value === '2'
    ? (Number(value) as CanonStatusValue)
    : null
}

export function readSort(value: string | null): EntitySort | null {
  return value === 'updated' || value === 'name' || value === 'created' ? value : null
}

export function readPage(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}
