import type { CanonStatusValue, EntityPage, EntitySort } from './types'

export type LoadState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error' }

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

/** The address with these changes, always back on the first page unless a page is given. */
export function changed(from: URLSearchParams, changes: Record<string, string | null>) {
  const next = new URLSearchParams(from)
  next.delete('page')
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  return next
}
