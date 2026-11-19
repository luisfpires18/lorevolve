import { useCallback, useState } from 'react'
import type { Fraction } from '../components/MapCalibration'
import { useAsyncRead, type Load } from '../lib/useAsyncRead'
import { getMap } from './api'
import type { MapDetail, MapPin } from './types'

export type LoadState = Load<MapDetail>

export type PinForm = { kind: 'new'; at: { x: number; y: number } } | { kind: 'edit'; pin: MapPin }

export type MapDialog = 'details' | 'replace' | null

export function useMapPageState({
  params,
  universeId,
  mapId,
}: {
  params: URLSearchParams
  universeId: string
  mapId: string | undefined
}) {
  const read = useCallback(
    (signal: AbortSignal) => (mapId ? getMap(universeId, mapId, signal) : undefined),
    [universeId, mapId],
  )
  const { load: state, setLoad: setState, refresh, retry } = useAsyncRead(read, { missing: true })
  const [placing, setPlacing] = useState(false)
  const [pinForm, setPinForm] = useState<PinForm | null>(null)
  const [dialog, setDialog] = useState<MapDialog>(null)
  const [focusPinId, setFocusPinId] = useState<string | null>(params.get('pin'))
  const [failure, setFailure] = useState<string | null>(null)
  // Calibrating (issue #53): the two points marked so far, or null when not calibrating.
  const [calibrating, setCalibrating] = useState<Fraction[] | null>(null)
  return {
    state,
    setState,
    refresh,
    retry,
    placing,
    setPlacing,
    pinForm,
    setPinForm,
    dialog,
    setDialog,
    focusPinId,
    setFocusPinId,
    failure,
    setFailure,
    calibrating,
    setCalibrating,
  }
}
