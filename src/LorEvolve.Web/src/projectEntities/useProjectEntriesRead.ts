import { useEffect, useState } from 'react'
import { listProjectEntities, listProjectTypes } from './api'
import type { ProjectEntitySummary } from './types'
import { t } from '../i18n'
import type { useProjectEntriesState } from './useProjectEntriesState'
import { errorText } from '../lib/errorText'
import { useDebouncedValue } from '../lib/useDebouncedValue'

/** How many entries one read shows; the next page is asked for, never loaded behind the author's back (#196). */
export const ENTRY_PAGE_SIZE = 25

/** The most rows reaching a named entry will read, matching the endpoint's own ceiling on one request. */
const ENTRY_LIST_CEILING = 500

/** Filters in the address, the reads a page at a time, and the refresh after a write. */
export function useProjectEntriesRead({
  projectId,
  fixedTypeId,
  openEntryId,
  reloadKey,
  onChanged,
  setParams,
  q,
  sort,
  nested,
  searchText,
  setSearchText,
  filter,
  setTypes,
  typeId,
  setTypeId,
  entries,
  setEntries,
  setMore,
  setFailed,
  setBusy,
  readRef,
}: ReturnType<typeof useProjectEntriesState> & {
  projectId: string
  fixedTypeId?: string
  openEntryId?: string
  reloadKey: number
  onChanged?: () => void
}) {
  function setFilter(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }

  function clearFilters() {
    setSearchText('')
    setFilter({ q: null, sort: null, nested: null })
  }

  // Typing waits for a pause before it reaches the address, and so the read, as Lore's search does.
  const settledText = useDebouncedValue(searchText)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    if (settledText !== q) setFilter({ q: settledText.trim() || null })
    // Only a settled word writes the address; an address that moved by itself is not written back over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledText])

  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(projectId, controller.signal)
      .then((read) => {
        setTypes(read)
        // A type named by the address is never swapped for another: if it is gone, the render below says so.
        if (fixedTypeId) return
        setTypeId((current) =>
          current !== null && read.some((type) => type.id === current)
            ? current
            : (read[0]?.id ?? null),
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(errorText(error, t('projects.entries.failed')))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  useEffect(() => {
    // No type chosen means there is nothing to read: the empty list is derived during render rather than written here,
    // because setting state inside an effect only to say "nothing" starts a second render for no reason.
    if (typeId === null) return

    const controller = new AbortController()
    readRef.current = controller

    /*
     * The first page, or as many pages as it takes to include the entry the address names, so a link to an entry does
     * not land on a list that does not hold it. Bounded by the endpoint's own ceiling on one request, so a long list
     * cannot become an unbounded read. Defined here rather than beside the component, because it closes over the read
     * this effect owns and belongs to its lifetime.
     */
    const reach = async (signal: AbortSignal, forType: string) => {
      const first = await listProjectEntities(projectId, forType, signal, {
        skip: 0,
        take: ENTRY_PAGE_SIZE + 1,
        ...filter,
      })

      if (!openEntryId) return { read: first, shown: ENTRY_PAGE_SIZE }

      let read = first
      let shown = ENTRY_PAGE_SIZE
      while (
        read.length > shown &&
        shown < ENTRY_LIST_CEILING &&
        !read.slice(0, shown).some((entry) => entry.id === openEntryId)
      ) {
        const next = await listProjectEntities(projectId, forType, signal, {
          skip: read.length,
          take: ENTRY_PAGE_SIZE + 1,
          ...filter,
        })
        read = [...read.slice(0, shown), ...next]
        shown += ENTRY_PAGE_SIZE
      }
      return { read, shown }
    }

    reach(controller.signal, typeId)
      .then(({ read, shown }) => showing(read, shown))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setEntries([])
        setFailed(errorText(error, t('projects.entries.failed')))
      })
    return () => controller.abort()
  }, [projectId, typeId, reloadKey, openEntryId, q, sort, nested])

  /** One more row than is shown is asked for, so whether another page exists is known without a count. */
  function showing(read: ProjectEntitySummary[], shown: number) {
    setEntries(read.slice(0, shown))
    setMore(read.length > shown)
  }

  function loadMore() {
    if (typeId === null || entries === null) return
    setBusy(true)
    setLoadingMore(true)
    // Tied to the main read's signal: a filter change aborts it, so a late page never lands on a newer list.
    const signal = readRef.current?.signal
    listProjectEntities(projectId, typeId, signal, {
      skip: entries.length,
      take: ENTRY_PAGE_SIZE + 1,
      ...filter,
    })
      .then((read) => {
        setBusy(false)
        setLoadingMore(false)
        if (signal?.aborted) return
        setEntries((current) => [...(current ?? []), ...read.slice(0, ENTRY_PAGE_SIZE)])
        setMore(read.length > ENTRY_PAGE_SIZE)
      })
      .catch((error: unknown) => {
        setLoadingMore(false)
        failing(error, signal)
      })
  }

  function refresh(notice: string | null = null) {
    if (typeId === null) return
    // A write re-reads as many rows as were already open, so the author keeps their place in a long list.
    const shown = Math.max(entries?.length ?? 0, ENTRY_PAGE_SIZE)
    const signal = readRef.current?.signal
    listProjectEntities(projectId, typeId, signal, { skip: 0, take: shown + 1, ...filter })
      .then((read) => {
        setBusy(false)
        // The write itself happened, so the parent is told even when a newer list has replaced this read.
        if (!signal?.aborted) {
          showing(read, shown)
          setFailed(notice)
        }
        onChanged?.()
      })
      .catch((error: unknown) => failing(error, signal))
  }

  function failing(error: unknown, signal?: AbortSignal) {
    setBusy(false)
    if (signal?.aborted) return
    setFailed(errorText(error, t('projects.entries.failed')))
  }
  return { setFilter, clearFilters, loadMore, loadingMore, refresh, failing }
}
