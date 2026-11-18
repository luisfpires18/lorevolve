import { ImageUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import type { Fraction } from '../MapCalibration'
import { PageHeader } from '../PageHeader'
import { mapsPath } from '../../maps/api'
import type { MapDetail } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { MapDialog } from '../../maps/useMapPageState'
import { Button } from '../Button'

export function MapHeader({
  map,
  universe,
  headingId,
  canEdit,
  placing,
  setPlacing,
  calibrating,
  setDialog,
  removeMap,
}: {
  map: MapDetail
  universe: WorkspaceContext['universe']
  headingId: string
  canEdit: boolean
  placing: boolean
  setPlacing: Dispatch<SetStateAction<boolean>>
  calibrating: Fraction[] | null
  setDialog: (dialog: MapDialog) => void
  removeMap: (map: MapDetail) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <PageHeader
      title={<bdi>{map.name}</bdi>}
      titleId={headingId}
      titleTestId="map-name"
      crumb={<Link to={mapsPath(universe.id)}>{t('places.mapPage.crumb')}</Link>}
      lede={map.description ? <span dir="auto">{map.description}</span> : undefined}
      actions={
        canEdit ? (
          <>
            <Button
              icon={Plus}
              aria-pressed={placing}
              disabled={calibrating !== null}
              onClick={() => setPlacing((current) => !current)}
              data-testid="map-add-pin"
            >
              {placing ? t('places.mapPage.placingButton') : t('places.mapPage.addPin')}
            </Button>
            <ActionMenu
              label={t('places.mapPage.moreActions', { name: map.name })}
              triggerTestId="map-actions"
              panelTestId="map-actions-panel"
            >
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => setDialog('details')}
                data-testid="map-edit-details"
              >
                <ActionIcon icon={Pencil} />
                {t('places.mapPage.editDetails')}
              </button>
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => setDialog('replace')}
                data-testid="map-replace-image"
              >
                <ActionIcon icon={ImageUp} />
                {t('places.mapPage.replacePicture')}
              </button>
              <hr className="actionmenu__divider" />
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                onClick={() => void removeMap(map)}
                data-testid="map-delete"
              >
                <ActionIcon icon={Trash2} />
                {t('places.mapPage.deleteMap')}
              </button>
            </ActionMenu>
          </>
        ) : undefined
      }
    />
  )
}
