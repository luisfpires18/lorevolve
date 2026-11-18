import { EntityPicker, type EntityChoice } from '../EntityPicker'
import { FamilyDiscovery } from '../FamilyDiscovery'
import type { RelationshipType } from '../../relationships/types'
import { useI18n } from '../../i18n'
import type { LoadState } from '../../familyTree/useFamilyTreeState'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseAccess } from '../../universes/access'

export function FamilyStart({
  universe,
  access,
  view,
  hasEligibleType,
  kinds,
  familyKinds,
  setupReads,
  show,
}: {
  universe: WorkspaceContext['universe']
  access: ReturnType<typeof useUniverseAccess>
  view: LoadState | { kind: 'idle' }
  hasEligibleType: boolean | null
  kinds: RelationshipType[] | null
  familyKinds: RelationshipType[]
  setupReads: number
  show: (choice: EntityChoice | null) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <>
      {/* No entry in the address: the families already recorded, once there can be any - a type enabled for the tree
          and a kind with a family meaning. Asked for alongside those checks rather than after them. */}
      {view.kind === 'idle' &&
      hasEligibleType !== false &&
      !(kinds !== null && familyKinds.length === 0) ? (
        <FamilyDiscovery
          key={setupReads}
          universeId={universe.id}
          canEdit={access.editContent}
          onChoose={show}
        />
      ) : null}

      {/* No family kind yet means no family to discover: someone can still be opened, as before, while one is made. */}
      {view.kind === 'idle' && hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="family__picker">
          <EntityPicker
            label={t('places.familyPage.whose')}
            universeId={universe.id}
            value={null}
            onChange={show}
            familyTreeOnly
            placeholder={t('places.familyPage.pickerPlaceholder')}
          />
        </div>
      ) : null}
    </>
  )
}
