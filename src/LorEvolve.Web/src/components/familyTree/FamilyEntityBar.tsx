import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
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
      <Link
        className="family__browse"
        to={`/app/universes/${universe.id}/family-tree${familiesFrom}`}
        data-testid="family-browse"
      >
        <ArrowLeft
          className="family__browseicon"
          aria-hidden="true"
          focusable="false"
          strokeWidth={1.75}
        />
        {t('places.familyPage.browse')}
      </Link>
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
