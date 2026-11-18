import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { fitView, ZOOM_STEP, type usePanZoom } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'
import { IconButton } from '../IconButton'

/** The canvas's zoom in, zoom out and fit buttons. */
export function MachineZoomControls({
  zoomAbout,
  size,
  setView,
  items,
}: Pick<ReturnType<typeof usePanZoom>, 'zoomAbout' | 'size' | 'setView'> & {
  items: { x: number; y: number; width: number; height: number }[]
}) {
  const { t } = useI18n()

  return (
    <div
      className="mapviewer__controls boardcanvas__controls"
      role="group"
      aria-label={t('canon.worldLogic.systems.machine.zoom')}
    >
      <IconButton
        icon={ZoomIn}
        label={t('canon.worldLogic.systems.machine.zoomIn')}
        onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="machine-zoom-in"
      />
      <IconButton
        icon={ZoomOut}
        label={t('canon.worldLogic.systems.machine.zoomOut')}
        onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="machine-zoom-out"
      />
      <IconButton
        icon={Maximize}
        label={t('canon.worldLogic.systems.machine.fit')}
        onClick={() => setView(fitView(items, size))}
        data-testid="machine-fit"
      />
    </div>
  )
}
