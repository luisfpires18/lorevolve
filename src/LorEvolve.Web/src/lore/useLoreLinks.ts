import { useRef } from 'react'
import type { To } from 'react-router-dom'
import {
  FIELD_FILTER_PARAM,
  isValidFor,
  readFieldFilters,
  withFieldFilters,
  type FieldFilter,
} from './fieldFilters'
import type { SetURLSearchParams } from 'react-router-dom'
import { changed } from '../lib/queryParams'
import type { EntityType } from './typeDefinitions'

/** Lore's address written: the links to a type, a group or no filters, and the moves to a page or a filter. */
export function useLoreLinks({
  params,
  setParams,
  selectedType,
}: {
  params: URLSearchParams
  setParams: SetURLSearchParams
  selectedType: EntityType | null
}) {
  const withParams = (changes: Record<string, string | null>) => changed(params, changes)

  /** Written against the address as it is when the change lands, not as it was when drawn. React Router hands a
      functional update the last render's params, which a navigation still rendering has moved past: a status chosen
      just after a field filter was applied would write the filter away. */
  const liveParams = () => new URLSearchParams(window.location.search)
  const update = (changes: Record<string, string | null>, replace: boolean) =>
    setParams(changed(liveParams(), changes), { replace })

  /** A page is a move: Back returns to the page before. */
  function goToPage(next: number) {
    update({ page: next > 1 ? String(next) : null }, false)
    window.scrollTo({ top: 0 })
  }

  /** Field filters are a move, like a page: Back undoes one. */
  function setFieldFilters(change: (current: FieldFilter[]) => FieldFilter[]) {
    const live = liveParams()
    const current = selectedType
      ? readFieldFilters(live).filter((filter) => isValidFor(filter, selectedType))
      : []
    setParams(withFieldFilters(live, change(current)))
  }

  // Everything that narrows, gone at once and the scope kept. A move, so Back brings the filters back.
  const searchRef = useRef<HTMLInputElement>(null)
  const clearedSearch = (): To => {
    const next = withParams({
      q: null,
      exact: null,
      status: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
    return { search: next ? `?${next}` : '' }
  }

  // Another type is another set of fields: its filters do not travel with the author.
  const hrefFor = (typeId: string | null): To => {
    const next = withParams({
      type: typeId,
      group: null,
      browse: null,
      open: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
    return { search: next ? `?${next}` : '' }
  }

  const typeHref = (typeId: string) => hrefFor(typeId)

  // A group drops the type, and with it the type's field filters.
  const groupHref = (groupId: string): To => {
    const next = withParams({
      group: groupId,
      type: null,
      browse: null,
      open: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
    return { search: `?${next}` }
  }

  return {
    withParams,
    update,
    goToPage,
    setFieldFilters,
    searchRef,
    clearedSearch,
    hrefFor,
    typeHref,
    groupHref,
  }
}
