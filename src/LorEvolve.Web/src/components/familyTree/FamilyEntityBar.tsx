import { Crumb } from '../Crumb'
import { EntityPicker, type EntityChoice } from '../EntityPicker'
import { useI18n } from '../../i18n'
import type { FamilyTreeNode } from '../../familyTree/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'

export function FamilyEntityBar({
  universe,
  familiesFrom,
  focal,
  show,
}: {
  universe: WorkspaceContext['universe']
  familiesFrom: string
  focal: FamilyTreeNode | null
  show: (choice: EntityChoice | null) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <>
      {/* Back to the families: the search and page this tree was opened from, if it was. */}
      <Crumb
        back
        className="family__browse"
        items={[
          {
            to: `/app/universes/${universe.id}/family-tree${familiesFrom}`,
            label: t('places.familyPage.browse'),
            testId: 'family-browse',
          },
        ]}
      />
      <div className="family__picker">
        <EntityPicker
          label={focal ? t('places.familyPage.shownFor') : t('places.familyPage.whose')}
          universeId={universe.id}
          value={focal ? { id: focal.entityId, name: focal.name } : null}
          onChange={show}
          familyTreeOnly
          placeholder={t('places.familyPage.pickerPlaceholder')}
        />
      </div>
    </>
  )
}
