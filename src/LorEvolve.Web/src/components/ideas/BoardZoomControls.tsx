import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { BoardCard } from '../../ideas/boards'
import { fitView, ZOOM_STEP, type usePanZoom } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'
import { IconButton } from '../IconButton'

/** The board's zoom in, zoom out and fit buttons. */
export function BoardZoomControls({
  cards,
  size,
  setView,
  zoomAbout,
}: Pick<ReturnType<typeof usePanZoom>, 'size' | 'setView' | 'zoomAbout'> & { cards: BoardCard[] }) {
  const { t } = useI18n()
  return (
    <div
      className="mapviewer__controls boardcanvas__controls"
      role="group"
      aria-label={t('ideas.canvas.zoom')}
    >
      <IconButton
        icon={ZoomIn}
        label={t('ideas.canvas.zoomIn')}
        onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="board-zoom-in"
      />
      <IconButton
        icon={ZoomOut}
        label={t('ideas.canvas.zoomOut')}
        onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="board-zoom-out"
      />
      <IconButton
        icon={Maximize}
        label={t('ideas.canvas.fit')}
        onClick={() => setView(fitView(cards, size))}
        data-testid="board-fit"
      />
    </div>
  )
}
