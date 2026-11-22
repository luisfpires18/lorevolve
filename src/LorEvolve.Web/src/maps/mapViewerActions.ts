import type { KeyboardEvent } from 'react'
import type { MapPin } from './types'
import { usePanZoom, type StageSize, type View } from '../lib/usePanZoom'
import { panZoomKey } from '../lib/canvasKeys'
import type { Dispatch, RefObject, SetStateAction } from 'react'

export function mapViewerActions({
  canEdit,
  placing,
  selectedPinId,
  onSelectPin,
  onPlace,
  onMovePin,
  stage,
  size,
  setDragging,
  setView,
  zoomAbout,
  fit,
  fractionAt,
}: {
  canEdit: boolean
  placing: boolean
  selectedPinId: string | null
  onSelectPin: (pinId: string | null) => void
  onPlace?: (x: number, y: number) => void
  onMovePin?: (pin: MapPin, x: number, y: number) => void
  stage: RefObject<HTMLDivElement | null>
  size: StageSize
  setDragging: Dispatch<SetStateAction<{ id: string; x: number; y: number } | null>>
  setView: ReturnType<typeof usePanZoom>['setView']
  zoomAbout: ReturnType<typeof usePanZoom>['zoomAbout']
  fit: (stageWidth: number, stageHeight: number) => View
  fractionAt: (clientX: number, clientY: number) => { x: number; y: number }
}) {
  /**
   * The press is the pin's: released without moving it selects the pin; dragged, and only for someone who may edit, it
   * moves the pin.
   */
  function pinDrag(pin: MapPin) {
    return {
      onMove: (clientX: number, clientY: number) => {
        if (canEdit && !placing) setDragging({ id: pin.id, ...fractionAt(clientX, clientY) })
      },
      onEnd: (moved: boolean, clientX: number, clientY: number) => {
        if (moved && canEdit && !placing) {
          const at = fractionAt(clientX, clientY)
          setDragging(null)
          onMovePin?.(pin, at.x, at.y)
        } else {
          // A press always selects; the empty map or Escape clears. Never a toggle, so a press is never a surprise.
          onSelectPin(pin.id)
        }
      },
      onCancel: () => setDragging(null),
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Escape') {
      if (!selectedPinId) return
      onSelectPin(null)
    } else if (event.key === 'Enter') {
      if (!placing || !onPlace) return
      const rect = stage.current!.getBoundingClientRect()
      const at = fractionAt(rect.left + size.width / 2, rect.top + size.height / 2)
      onPlace(at.x, at.y)
    } else if (
      !panZoomKey(event.key, { size, setView, zoomAbout, fit: () => fit(size.width, size.height) })
    )
      return
    event.preventDefault()
  }
  return { pinDrag, onKeyDown }
}
