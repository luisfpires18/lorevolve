import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { usePanZoom, ZOOM_STEP, type StageSize, type View } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'

export function MapViewerControls({
  zoomAbout,
  setView,
  fit,
  size,
  placing,
  hintId,
}: {
  zoomAbout: ReturnType<typeof usePanZoom>['zoomAbout']
  setView: ReturnType<typeof usePanZoom>['setView']
  fit: (stageWidth: number, stageHeight: number) => View
  size: StageSize
  placing: boolean
  hintId: string
}) {
  const { t } = useI18n()

  return (
    <>
      <div className="mapviewer__controls" role="group" aria-label={t('places.viewer.zoom')}>
        <button
          className="iconbutton"
          type="button"
          aria-label={t('places.viewer.zoomIn')}
          title={t('places.viewer.zoomIn')}
          onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-in"
        >
          <ZoomIn aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label={t('places.viewer.zoomOut')}
          title={t('places.viewer.zoomOut')}
          onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-out"
        >
          <ZoomOut aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <button
          className="iconbutton"
          type="button"
          aria-label={t('places.viewer.fit')}
          title={t('places.viewer.fit')}
          onClick={() => setView(fit(size.width, size.height))}
          data-testid="map-fit"
        >
          <Maximize aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
      </div>

      <p className="visually-hidden" id={hintId}>
        {placing ? t('places.viewer.hintPlacing') : t('places.viewer.hint')}
      </p>
    </>
  )
}
