import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { BoardCard } from '../../ideas/boards'
import { fitView, ZOOM_STEP, type usePanZoom } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'

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
      <button
        className="iconbutton"
        type="button"
        aria-label={t('ideas.canvas.zoomIn')}
        title={t('ideas.canvas.zoomIn')}
        onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="board-zoom-in"
      >
        <ZoomIn aria-hidden="true" focusable="false" strokeWidth={1.75} />
      </button>
      <button
        className="iconbutton"
        type="button"
        aria-label={t('ideas.canvas.zoomOut')}
        title={t('ideas.canvas.zoomOut')}
        onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid="board-zoom-out"
      >
        <ZoomOut aria-hidden="true" focusable="false" strokeWidth={1.75} />
      </button>
      <button
        className="iconbutton"
        type="button"
        aria-label={t('ideas.canvas.fit')}
        title={t('ideas.canvas.fit')}
        onClick={() => setView(fitView(cards, size))}
        data-testid="board-fit"
      >
        <Maximize aria-hidden="true" focusable="false" strokeWidth={1.75} />
      </button>
    </div>
  )
}
