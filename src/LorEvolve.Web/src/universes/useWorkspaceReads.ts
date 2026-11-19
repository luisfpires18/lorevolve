import { useCallback, useEffect } from 'react'
import { listAllProjects } from '../projects/api'
import { projectFamilies } from '../projects/sections'
import { getChronology } from '../chronology/api'
import { listEntityTypeGroups, listEntityTypes } from '../lore/typesApi'
import { getUniverse } from './api'
import { t } from '../i18n'
import { preloadSections } from '../screens'
import type { useWorkspaceState } from './useWorkspaceState'
import { errorText } from '../lib/errorText'

/** The universe, its types and its projects read and read again, and the sections' code fetched once it is open. */
export function useWorkspaceReads({
  id,
  state,
  setState,
  setTypes,
  setTypeGroups,
  setFamilies,
  projectsRead,
  typesRead,
  typesClaimed,
}: ReturnType<typeof useWorkspaceState> & { id: string | undefined }) {
  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return
      Promise.all([getUniverse(id, signal), getChronology(id, signal)])
        .then(([universe, chronology]) => setState({ kind: 'ready', universe, chronology }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          // The API answers 404 both for a missing universe and for someone else's.
          const status = (error as { status?: number }).status
          setState(
            status === 404
              ? { kind: 'missing' }
              : {
                  kind: 'error',
                  message: errorText(error, t('workspace.missing.failed')),
                },
          )
        })
    },
    [id],
  )

  // The latest read wins: a new one cancels the one before, so an older answer never lands over a newer one.
  const readTypes = useCallback(() => {
    if (!id) return Promise.resolve()
    typesRead.current?.abort()
    const controller = new AbortController()
    typesRead.current = controller
    const { signal } = controller
    return Promise.all([
      listEntityTypes(id, signal).then(setTypes, (error: unknown) => {
        if (!signal.aborted) setTypes((current) => (Array.isArray(current) ? current : 'failed'))
        throw error
      }),
      listEntityTypeGroups(id, signal).then(setTypeGroups, (error: unknown) => {
        if (!signal.aborted)
          setTypeGroups((current) => (Array.isArray(current) ? current : 'failed'))
        throw error
      }),
    ]).then(
      () => undefined,
      (error: unknown) => {
        if (!signal.aborted) throw error
      },
    )
  }, [id])

  // Read again on request: a failure shown gives way to the read; a copy already read stays on screen while it is out.
  const refreshTypes = useCallback(() => {
    setTypes((current) => (current === 'failed' ? null : current))
    setTypeGroups((current) => (current === 'failed' ? null : current))
    return readTypes()
  }, [readTypes])

  // The latest read wins, as for the types. A failed read leaves what was read before.
  const refreshProjects = useCallback(() => {
    if (!id) return Promise.resolve()
    projectsRead.current?.abort()
    const controller = new AbortController()
    projectsRead.current = controller
    return listAllProjects({ universeId: id }, controller.signal).then(
      (projects) => setFamilies(projectFamilies(projects)),
      (error: unknown) => {
        if (!controller.signal.aborted) throw error
      },
    )
  }, [id])

  const revalidateTypes = useCallback(() => {
    if (!typesClaimed.current) {
      typesClaimed.current = true
      return
    }
    refreshTypes().catch(() => undefined)
  }, [refreshTypes])

  // The types leave with the universe and its chronology, not after the screen that needs them has loaded and mounted.
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    readTypes().catch(() => undefined)
    refreshProjects().catch(() => undefined)
    return () => {
      controller.abort()
      typesRead.current?.abort()
      projectsRead.current?.abort()
    }
  }, [load, readTypes, refreshProjects])

  // Once the universe is open and the browser has nothing better to do, every section's code and an entry's are fetched,
  // so the first visit to another one opens without a fallback.
  const isReady = state.kind === 'ready'
  useEffect(() => {
    if (!isReady) return
    // Not on a metered or slow connection: a visitor who asked for less data is not handed every section's code.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (connection?.saveData || /(^|-)[23]g$/.test(connection?.effectiveType ?? '')) return
    // A pause first, then idle: a dynamic import is a high-priority fetch, and on a real network it was competing with
    // the page's own reads and its pictures, which the browser fetches at low priority.
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(preloadSections)
      else preloadSections()
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [isReady])

  return { load, refreshTypes, refreshProjects, revalidateTypes }
}
