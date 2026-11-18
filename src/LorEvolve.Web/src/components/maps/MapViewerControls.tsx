import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { usePanZoom, ZOOM_STEP, type StageSize, type View } from '../../lib/usePanZoom'
import { useI18n } from '../../i18n'
import { IconButton } from '../IconButton'

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
        <IconButton
          icon={ZoomIn}
          label={t('places.viewer.zoomIn')}
          onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-in"
        />
        <IconButton
          icon={ZoomOut}
          label={t('places.viewer.zoomOut')}
          onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
          data-testid="map-zoom-out"
        />
        <IconButton
          icon={Maximize}
          label={t('places.viewer.fit')}
          onClick={() => setView(fit(size.width, size.height))}
          data-testid="map-fit"
        />
      </div>

      <p className="visually-hidden" id={hintId}>
        {placing ? t('places.viewer.hintPlacing') : t('places.viewer.hint')}
      </p>
    </>
  )
}
