import { useEffect, useMemo, useRef, useState } from 'react'
import { listEntities, readLorePageSize } from './api'
import type { CanonStatusValue, EntitySort } from './types'
import type { EntityTypeGroup } from './typeDefinitions'
import {
  FIELD_FILTER_PARAM,
  encodeFieldFilter,
  isValidFor,
  readFieldFilters,
  withFieldFilters,
  type FieldFilter,
} from './fieldFilters'
import { buildTypeTree } from './typeTree'
import { useWorkspaceTypes } from '../pages/useWorkspaceTypes'
import type { SetURLSearchParams } from 'react-router-dom'
import { errorText } from '../lib/errorText'
import type { LoadState } from './loreAddress'

/** Groups that could not be read: none to offer, one stable list. */
const EMPTY_GROUPS: EntityTypeGroup[] = []

/** Lore's types and groups, what the address chooses among them, and the read of the page of entries it asks for. */
export function useLoreEntries({
  typesRead,
  groupsRead,
  universe,
  setParams,
  typeParam,
  groupParam,
  browseParam,
  canonStatus,
  search,
  exact,
  sort,
  page,
  addressFilters,
}: {
  typesRead: ReturnType<typeof useWorkspaceTypes>['entryTypes']
  groupsRead: ReturnType<typeof useWorkspaceTypes>['groups']
  universe: { id: string }
  setParams: SetURLSearchParams
  typeParam: string | null
  groupParam: string | null
  browseParam: string | null
  canonStatus: CanonStatusValue | null
  search: string
  exact: boolean
  sort: EntitySort | null
  page: number
  addressFilters: ReturnType<typeof readFieldFilters>
}) {
  // The types and groups come with the universe (`useWorkspaceTypes`). A failed read of the types is not a universe without
  // any: `types` stays unknown, so nothing below reads the failure as "no types" or takes a chosen type out of the address
  // as one that does not exist (#58).
  const types = Array.isArray(typesRead) ? typesRead : null
  const typesFailed = typesRead === 'failed'
  // Groups are a second way in, not a requirement: if they cannot be read, Lore is browsed by type alone.
  const groups = groupsRead === 'failed' ? EMPTY_GROUPS : groupsRead
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Entries per page: the author's own preference in this browser, never in the address - a link someone shares opens at
  // their reader's size, not the sender's.
  const [pageSize, setPageSize] = useState(readLorePageSize)

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  const selectedNode = (typeParam && tree.byId.get(typeParam)) || null
  const selectedType = selectedNode?.type ?? null
  const isUnknownType = typeParam !== null && types !== null && selectedType === null
  // A type in the address wins over a group, so the two are never read together.
  const selectedGroup =
    (!typeParam && groupParam && groups?.find((group) => group.id === groupParam)) || null
  const isUnknownGroup =
    !typeParam && groupParam !== null && groups !== null && selectedGroup === null
  const chosenName = selectedType?.name ?? selectedGroup?.name ?? null
  // Nothing named in the address: Lore's front page, the catalog of types (Issue #60).
  const atCatalog = !typeParam && !groupParam
  const browsing =
    (atCatalog && browseParam && groups?.find((group) => group.id === browseParam)) || null
  const isUnknownBrowse = atCatalog && browseParam !== null && groups !== null && browsing === null

  // A type this universe does not have is taken out of the address in place, which leaves nothing chosen.
  useEffect(() => {
    if (!isUnknownType) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('type')
        next.delete('page')
        next.delete(FIELD_FILTER_PARAM)
        return next
      },
      { replace: true },
    )
  }, [isUnknownType, setParams])

  useEffect(() => {
    if (!isUnknownGroup) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('group')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [isUnknownGroup, setParams])

  // A catalog narrowed to a group the universe does not have shows every type again, with the address cleaned in place.
  useEffect(() => {
    if (!isUnknownBrowse) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('browse')
        return next
      },
      { replace: true },
    )
  }, [isUnknownBrowse, setParams])

  // Field filters the chosen type can still answer. One the address carries that it cannot - a field since deleted or
  // changed, an option gone, a hand-edited value - is taken out in place, never read as another filter, and never sent.
  const fieldFilters: FieldFilter[] = selectedType
    ? addressFilters.filter((filter) => isValidFor(filter, selectedType))
    : []
  // A group has no fields of its own, so every field filter in its address is stale too.
  const hasStaleFilters =
    (selectedType !== null || selectedGroup !== null) &&
    fieldFilters.length !== addressFilters.length
  useEffect(() => {
    if (!hasStaleFilters) return
    setParams(
      (current) =>
        withFieldFilters(
          current,
          selectedType
            ? readFieldFilters(current).filter((filter) => isValidFor(filter, selectedType))
            : [],
        ),
      { replace: true },
    )
  }, [hasStaleFilters, selectedType, setParams])
  const fieldFiltersKey = fieldFilters.map(encodeFieldFilter).join('&')

  // Only a type of this universe is ever asked for, and only once the types are known.
  const entityTypeId = selectedType?.id ?? null
  const entityTypeGroupId = selectedGroup?.id ?? null

  // The search text the last read was asked for. Only a change of it waits for typing to pause; the first read and a
  // type, page, sort or filter change go out at once.
  const searchRead = useRef<string | null>(null)

  useEffect(() => {
    if (entityTypeId === null && entityTypeGroupId === null) return
    const delay = searchRead.current !== null && searchRead.current !== search ? 150 : 0
    searchRead.current = search
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universe.id,
        {
          search,
          entityTypeId,
          entityTypeGroupId,
          includeDescendants: true,
          canonStatus,
          tag: null,
          page,
          pageSize,
          fieldFilters,
          exact,
          sort,
        },
        controller.signal,
      )
        .then((result) => setState({ kind: 'ready', value: result }))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setState({ kind: 'error', message: errorText(error, '') })
        })
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // fieldFilters is read through its key: a fresh array of the same filters is not a new list.
  }, [
    universe.id,
    search,
    exact,
    sort,
    entityTypeId,
    entityTypeGroupId,
    canonStatus,
    page,
    pageSize,
    reads,
    fieldFiltersKey,
  ])

  return {
    types,
    typesFailed,
    groups,
    state,
    setState,
    reads,
    setReads,
    filtersOpen,
    setFiltersOpen,
    pageSize,
    setPageSize,
    tree,
    selectedNode,
    selectedType,
    selectedGroup,
    chosenName,
    atCatalog,
    browsing,
    fieldFilters,
    entityTypeId,
    entityTypeGroupId,
  }
}
