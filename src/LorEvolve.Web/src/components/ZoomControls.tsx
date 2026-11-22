import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { ZOOM_STEP, type StageSize, type usePanZoom } from '../lib/usePanZoom'
import { useI18n } from '../i18n'
import { IconButton } from './IconButton'

/**
 * Zoom in, zoom out and fit for a pan and zoom canvas (`usePanZoom`), as a named group in the
 * canvas corner. The steps go about the stage centre; limits, wheel, pinch and drag stay in
 * `usePanZoom`. Catalogue: `docs/design/ui-components.md`.
 */
export function ZoomControls({
  zoomAbout,
  size,
  onFit,
  fitLabel,
  testId,
  look = 'map',
}: {
  zoomAbout: ReturnType<typeof usePanZoom>['zoomAbout']
  size: StageSize
  onFit: () => void
  /** What fit shows: the whole map, every card, every state. */
  fitLabel: string
  /** Prefix of the test ids: `${testId}-zoom-in`, `-zoom-out`, `-fit`. */
  testId: string
  /** `board` sits the group as the idea board and the machine canvas do. */
  look?: 'map' | 'board'
}) {
  const { t } = useI18n()
  return (
    <div
      className={
        look === 'board' ? 'mapviewer__controls boardcanvas__controls' : 'mapviewer__controls'
      }
      role="group"
      aria-label={t('shell.zoom.label')}
    >
      <IconButton
        icon={ZoomIn}
        label={t('shell.zoom.in')}
        onClick={() => zoomAbout(ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid={`${testId}-zoom-in`}
      />
      <IconButton
        icon={ZoomOut}
        label={t('shell.zoom.out')}
        onClick={() => zoomAbout(1 / ZOOM_STEP, size.width / 2, size.height / 2)}
        data-testid={`${testId}-zoom-out`}
      />
      <IconButton icon={Maximize} label={fitLabel} onClick={onFit} data-testid={`${testId}-fit`} />
    </div>
  )
}
