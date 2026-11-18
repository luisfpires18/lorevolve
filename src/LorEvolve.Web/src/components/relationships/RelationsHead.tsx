import { useI18n } from '../../i18n'
import type { RelationshipType } from '../../relationships/types'
import type { useUniverseAccess } from '../../universes/access'
import { NewButton } from '../NewButton'

export function RelationsHead({
  access,
  types,
  isAdding,
  editingId,
  openAdd,
}: {
  access: ReturnType<typeof useUniverseAccess>
  types: RelationshipType[]
  isAdding: boolean
  editingId: string | null
  openAdd: () => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <div className="relations__head">
      <h2 className="relations__title" id="relations-heading">
        {t('relationships.section.heading')}
      </h2>
      {access.editContent && types.length > 0 && !isAdding && !editingId ? (
        <NewButton tone="secondary" onClick={openAdd} data-testid="add-relationship">
          {t('relationships.section.add')}
        </NewButton>
      ) : null}
    </div>
  )
}
