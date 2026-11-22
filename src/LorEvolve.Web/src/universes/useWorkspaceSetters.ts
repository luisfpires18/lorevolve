import { useCallback } from 'react'
import type { Chronology } from '../chronology/types'
import type { EntityType, EntityTypeGroup } from '../lore/typeDefinitions'
import type { UniverseDetail } from './types'
import type { UniverseArtworkRef } from '../publishing/types'
import type { useWorkspaceState } from './useWorkspaceState'

/** What the shell hands its screens to change: the types and groups, the universe, its chronology and its artwork. */
export function useWorkspaceSetters({
  setState,
  setTypes,
  setTypeGroups,
  load,
}: ReturnType<typeof useWorkspaceState> & { load: (signal?: AbortSignal) => void }) {
  const setTypeList = useCallback((next: EntityType[]) => setTypes(next), [])
  const setGroupList = useCallback((next: EntityTypeGroup[]) => setTypeGroups(next), [])

  const refresh = useCallback(
    (next?: UniverseDetail) => {
      if (next) {
        setState((current) =>
          current.kind === 'ready'
            ? { ...current, value: { ...current.value, universe: next } }
            : current,
        )
      } else {
        load()
      }
    },
    [load],
  )

  const setChronology = useCallback((chronology: Chronology) => {
    setState((current) =>
      current.kind === 'ready' ? { ...current, value: { ...current.value, chronology } } : current,
    )
  }, [])

  // Publish hands up a changed artwork; only its two ids are the universe's to hold, and they replace the ones the
  // universe arrived with, so the atmosphere follows without a reload.
  const setArtwork = useCallback((next: UniverseArtworkRef | null) => {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              universe: {
                ...current.value.universe,
                artwork: next ? { assetId: next.assetId, cardId: next.cardId } : null,
              },
            },
          }
        : current,
    )
  }, [])

  return { setTypeList, setGroupList, refresh, setChronology, setArtwork }
}
