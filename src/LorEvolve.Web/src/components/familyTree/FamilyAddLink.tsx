import { Plus } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { FamilyLinkForm } from '../FamilyLinkForm'
import type { RelationshipType } from '../../relationships/types'
import { useI18n } from '../../i18n'
import type { FamilyTreeNode } from '../../familyTree/types'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'

export function FamilyAddLink({
  universe,
  entityId,
  focal,
  familyKinds,
  isAdding,
  addKind,
  setAddingFor,
  setReads,
}: {
  universe: WorkspaceContext['universe']
  entityId: string | undefined
  focal: FamilyTreeNode
  familyKinds: RelationshipType[]
  isAdding: boolean
  addKind: (created: RelationshipType) => void
  setAddingFor: Dispatch<SetStateAction<string | null>>
  setReads: Dispatch<SetStateAction<number>>
}) {
  const { t } = useI18n()

  return isAdding ? (
    <FamilyLinkForm
      universeId={universe.id}
      focal={{ id: focal.entityId, name: focal.name }}
      kinds={familyKinds}
      onKindCreated={addKind}
      onSaved={() => {
        setAddingFor(null)
        setReads((current) => current + 1)
      }}
      onCancel={() => setAddingFor(null)}
    />
  ) : (
    <button
      className="button button--secondary"
      type="button"
      onClick={() => setAddingFor(entityId ?? null)}
      data-testid="add-family-link"
    >
      <ActionIcon icon={Plus} />
      {t('places.familyPage.add')}
    </button>
  )
}
