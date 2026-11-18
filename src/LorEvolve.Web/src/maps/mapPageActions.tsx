import { Quoted } from '../components/NameList'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { deleteMap, deletePin, mapsPath, updatePin } from './api'
import type { MapDetail, MapPin } from './types'
import { useI18n } from '../i18n'
import type { MapsListNotice } from '../pages/MapsPage'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useMapPageState } from './useMapPageState'
import type { useNavigate, useSearchParams } from 'react-router-dom'

export function mapPageActions({
  universe,
  mapId,
  selectedPinId,
  setParams,
  navigate,
  setFocusPinId,
  setPinForm,
  setPlacing,
  setState,
  setFailure,
  setReads,
  t,
  tn,
  tx,
}: ReturnType<typeof useMapPageState> & {
  universe: WorkspaceContext['universe']
  mapId: string | undefined
  selectedPinId: string | null
  setParams: ReturnType<typeof useSearchParams>[1]
  navigate: ReturnType<typeof useNavigate>
  t: ReturnType<typeof useI18n>['t']
  tn: ReturnType<typeof useI18n>['tn']
  tx: ReturnType<typeof useI18n>['tx']
}) {
  function select(pinId: string | null, focus = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (pinId) next.set('pin', pinId)
        else next.delete('pin')
        return next
      },
      { replace: true },
    )
    if (focus && pinId) setFocusPinId(pinId)
  }

  function replaceMap(map: MapDetail) {
    setState({ kind: 'ready', map })
  }

  function pinSaved(saved: MapPin) {
    setPinForm(null)
    setPlacing(false)
    setState((current) => {
      if (current.kind !== 'ready') return current
      const pins = current.map.pins.some((pin) => pin.id === saved.id)
        ? current.map.pins.map((pin) => (pin.id === saved.id ? saved : pin))
        : [...current.map.pins, saved].sort((a, b) => a.title.localeCompare(b.title))
      return {
        kind: 'ready',
        map: {
          ...current.map,
          pins,
          pinsAwaitingReview: pins.filter((pin) => !pin.placedOnCurrentImage).length,
        },
      }
    })
    select(saved.id)
  }

  async function movePin(pin: MapPin, x: number, y: number) {
    setFailure(null)
    try {
      const saved = await updatePin(universe.id, mapId!, pin.id, {
        title: pin.title,
        note: pin.note,
        x,
        y,
        entityId: pin.lore && !pin.lore.isTrashed ? pin.lore.id : null,
      })
      pinSaved(saved)
    } catch (error: unknown) {
      setFailure(error instanceof ApiError ? error.message : t('places.mapPage.moveFailed'))
      setReads((current) => current + 1)
    }
  }

  async function removePin(pin: MapPin) {
    const confirmed = await confirmAction({
      title: tx('places.mapPage.removePinTitle', { pin: <Quoted text={pin.title} /> }),
      message: pin.lore ? t('places.mapPage.removePinLore') : t('places.mapPage.removePinOnly'),
      confirmLabel: t('places.mapPage.removePinConfirm'),
      variant: 'destructive',
      action: () => deletePin(universe.id, mapId!, pin.id),
    })
    if (!confirmed) return
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            map: {
              ...current.map,
              pins: current.map.pins.filter((each) => each.id !== pin.id),
              pinsAwaitingReview: current.map.pins.filter(
                (each) => each.id !== pin.id && !each.placedOnCurrentImage,
              ).length,
            },
          }
        : current,
    )
    if (selectedPinId === pin.id) select(null)
  }

  async function removeMap(map: MapDetail) {
    const confirmed = await confirmAction({
      title: tx('places.mapPage.deleteTitle', { map: <Quoted text={map.name} /> }),
      message: t('places.mapPage.deleteMessage'),
      details:
        map.pins.length > 0
          ? [tn('places.mapPage.pinCount', map.pins.length, { n: map.pins.length })]
          : undefined,
      confirmLabel: t('places.mapPage.deleteConfirm'),
      variant: 'destructive',
      action: () => deleteMap(universe.id, map.id),
    })
    if (!confirmed) return
    void navigate(mapsPath(universe.id), {
      state: { deleted: { name: map.name } } satisfies MapsListNotice,
    })
  }
  return { select, replaceMap, pinSaved, movePin, removePin, removeMap }
}
