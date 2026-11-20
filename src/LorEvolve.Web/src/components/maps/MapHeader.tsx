import { ImageUp, Pencil, Trash2 } from 'lucide-react'
import { Crumb } from '../Crumb'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import type { Fraction } from '../MapCalibration'
import { PageHeader } from '../PageHeader'
import { mapsPath } from '../../maps/api'
import type { MapDetail } from '../../maps/types'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { MapDialog } from '../../maps/useMapPageState'
import { NewButton } from '../NewButton'

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
      crumb={<Crumb items={[{ to: mapsPath(universe.id), label: t('places.mapPage.crumb') }]} />}
      lede={map.description ? <span dir="auto">{map.description}</span> : undefined}
      actions={
        canEdit ? (
          <>
            <NewButton
              aria-pressed={placing}
              disabled={calibrating !== null}
              onClick={() => setPlacing((current) => !current)}
              data-testid="map-add-pin"
            >
              {placing ? t('places.mapPage.placingButton') : t('places.mapPage.addPin')}
            </NewButton>
            <ActionMenu
              label={t('places.mapPage.moreActions', { name: map.name })}
              triggerTestId="map-actions"
              panelTestId="map-actions-panel"
            >
              <ActionMenuItem
                icon={Pencil}
                onClick={() => setDialog('details')}
                testId="map-edit-details"
              >
                {t('places.mapPage.editDetails')}
              </ActionMenuItem>
              <ActionMenuItem
                icon={ImageUp}
                onClick={() => setDialog('replace')}
                testId="map-replace-image"
              >
                {t('places.mapPage.replacePicture')}
              </ActionMenuItem>
              <hr className="actionmenu__divider" />
              <ActionMenuItem
                icon={Trash2}
                tone="danger"
                onClick={() => void removeMap(map)}
                testId="map-delete"
              >
                {t('places.mapPage.deleteMap')}
              </ActionMenuItem>
            </ActionMenu>
          </>
        ) : undefined
      }
    />
  )
}
