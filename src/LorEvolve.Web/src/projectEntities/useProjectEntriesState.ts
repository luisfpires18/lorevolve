import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ProjectEntityType, ProjectEntitySummary } from './types'

/** The address's search, sort and nesting, and every state and ref of the entries panel. */
export function useProjectEntriesState({
  startAdding,
  fixedTypeId,
}: {
  startAdding: boolean
  fixedTypeId?: string
}) {
  // Search, sort and nesting live in the address beside `type`, so a filtered list is linkable (#285).
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sort =
    sortParam === 'updated' || sortParam === 'name' || sortParam === 'created' ? sortParam : ''
  const nested = params.get('nested') === '1'
  const filtered = q !== '' || sort !== '' || nested
  const [searchText, setSearchText] = useState(q)
  const filter = { q, sort, includeDescendants: nested }
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [typeId, setTypeId] = useState<string | null>(fixedTypeId ?? null)
  const [entries, setEntries] = useState<ProjectEntitySummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The main read's controller: loadMore and refresh share its signal so a filter change cancels them too.
  const readRef = useRef<AbortController | null>(null)
  const [adding, setAdding] = useState(startAdding)
  return {
    params,
    setParams,
    q,
    sortParam,
    sort,
    nested,
    filtered,
    searchText,
    setSearchText,
    filter,
    types,
    setTypes,
    typeId,
    setTypeId,
    entries,
    setEntries,
    more,
    setMore,
    failed,
    setFailed,
    busy,
    setBusy,
    readRef,
    adding,
    setAdding,
  }
}
