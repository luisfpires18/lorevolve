import { useState } from 'react'
import type { Fraction } from '../components/MapCalibration'
import type { MapDetail, MapPin } from './types'

export type LoadState =
  { kind: 'loading' } | { kind: 'ready'; map: MapDetail } | { kind: 'missing' } | { kind: 'error' }

export type PinForm = { kind: 'new'; at: { x: number; y: number } } | { kind: 'edit'; pin: MapPin }

export type MapDialog = 'details' | 'replace' | null

export function useMapPageState({ params }: { params: URLSearchParams }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
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
    reads,
    setReads,
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
