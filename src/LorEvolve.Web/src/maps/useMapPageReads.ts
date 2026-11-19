import { useEffect } from 'react'
import type { useMapPageState } from './useMapPageState'
import type { useSearchParams } from 'react-router-dom'

export function useMapPageReads({
  state,
  selectedPinId,
  setParams,
}: ReturnType<typeof useMapPageState> & {
  selectedPinId: string | null
  setParams: ReturnType<typeof useSearchParams>[1]
}) {
  // A pin the address names that the map does not hold: the address is corrected rather than left pointing at nothing.
  useEffect(() => {
    if (state.kind !== 'ready' || !selectedPinId) return
    if (!state.value.pins.some((pin) => pin.id === selectedPinId)) {
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
