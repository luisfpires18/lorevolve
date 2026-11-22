import { FamilyLinkForm } from '../FamilyLinkForm'
import type { RelationshipType } from '../../relationships/types'
import { useI18n } from '../../i18n'
import type { FamilyTreeNode } from '../../familyTree/types'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import { NewButton } from '../NewButton'

export function FamilyAddLink({
  universe,
  entityId,
  focal,
  familyKinds,
  isAdding,
  addKind,
  setAddingFor,
  reread,
}: {
  universe: WorkspaceContext['universe']
  entityId: string | undefined
  focal: FamilyTreeNode
  familyKinds: RelationshipType[]
  isAdding: boolean
  addKind: (created: RelationshipType) => void
  setAddingFor: Dispatch<SetStateAction<string | null>>
  reread: () => void
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
        reread()
      }}
      onCancel={() => setAddingFor(null)}
    />
  ) : (
    <NewButton
      tone="secondary"
      onClick={() => setAddingFor(entityId ?? null)}
      data-testid="add-family-link"
    >
      {t('places.familyPage.add')}
    </NewButton>
  )
}
