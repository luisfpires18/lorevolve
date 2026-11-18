import { useCallback, useEffect } from 'react'
import { ApiError } from '../lib/api'
import { getMap } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useMapPageState } from './useMapPageState'
import type { useSearchParams } from 'react-router-dom'

export function useMapPageReads({
  universe,
  mapId,
  reads,
  state,
  setState,
  selectedPinId,
  setParams,
}: ReturnType<typeof useMapPageState> & {
  universe: WorkspaceContext['universe']
  mapId: string | undefined
  selectedPinId: string | null
  setParams: ReturnType<typeof useSearchParams>[1]
}) {
  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!mapId) return
      getMap(universe.id, mapId, signal)
        .then((map) => setState({ kind: 'ready', map }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setState(
            error instanceof ApiError && error.status === 404
              ? { kind: 'missing' }
              : { kind: 'error' },
          )
        })
    },
    [universe.id, mapId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, reads])

  // A pin the address names that the map does not hold: the address is corrected rather than left pointing at nothing.
  useEffect(() => {
    if (state.kind !== 'ready' || !selectedPinId) return
    if (!state.map.pins.some((pin) => pin.id === selectedPinId)) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('pin')
          return next
        },
        { replace: true },
      )
    }
  }, [state, selectedPinId, setParams])
}
