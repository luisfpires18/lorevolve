import { Link } from 'react-router-dom'
import { FamilyKindDialog } from '../FamilyKindDialog'
import type { RelationshipType } from '../../relationships/types'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseAccess } from '../../universes/access'
import { NewButton } from '../NewButton'

export function FamilySetupNotices({
  universe,
  access,
  hasEligibleType,
  kinds,
  familyKinds,
  typesPath,
  relationKindsPath,
  isCreatingKind,
  setIsCreatingKind,
  addKind,
}: {
  universe: WorkspaceContext['universe']
  access: ReturnType<typeof useUniverseAccess>
  hasEligibleType: boolean | null
  kinds: RelationshipType[] | null
  familyKinds: RelationshipType[]
  typesPath: string
  relationKindsPath: string
  isCreatingKind: boolean
  setIsCreatingKind: Dispatch<SetStateAction<boolean>>
  addKind: (created: RelationshipType) => void
}) {
  const { t, tx } = useI18n()

  return (
    <>
      {hasEligibleType === false ? (
        <p className="notice" data-testid="family-no-types">
          {tx('places.familyPage.noTypes', {
            link: <Link to={typesPath}>{t('places.familyPage.noTypesLink')}</Link>,
          })}
        </p>
      ) : null}

      {hasEligibleType && kinds !== null && familyKinds.length === 0 ? (
        <div className="notice family__nokinds" data-testid="family-no-kinds">
          <p>
            {tx('places.familyPage.noKinds', {
              link: <Link to={relationKindsPath}>{t('places.familyPage.noKindsLink')}</Link>,
            })}
          </p>
          {access.editContent ? (
            <NewButton
              tone="secondary"
              onClick={() => setIsCreatingKind(true)}
              data-testid="family-new-kind"
            >
              {t('places.familyPage.newKind')}
            </NewButton>
          ) : null}
        </div>
      ) : null}

      {isCreatingKind ? (
        <FamilyKindDialog
          universeId={universe.id}
          onClose={() => setIsCreatingKind(false)}
          onCreated={(created) => {
            addKind(created)
            setIsCreatingKind(false)
          }}
        />
      ) : null}
    </>
  )
}
