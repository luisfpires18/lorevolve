import { Link } from 'react-router-dom'
import { StatusBadge } from '../StatusBadge'
import { CANON_LABELS, CanonStatus } from '../../lore/types'
import type { RelationshipView } from '../../relationships/types'
import { useI18n } from '../../i18n'
import type { FamilyTreeNode } from '../../familyTree/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'

export function FamilyOtherRelations({
  universe,
  headingId,
  focal,
  otherRelations,
}: {
  universe: WorkspaceContext['universe']
  headingId: string
  focal: FamilyTreeNode
  otherRelations: RelationshipView[]
}) {
  const { t, tx } = useI18n()

  return (
    <section
      className="family__others"
      aria-labelledby={`${headingId}-others`}
      data-testid="family-other-relationships"
    >
      <h2 className="settings__heading" id={`${headingId}-others`}>
        {t('places.familyPage.othersHeading')}
      </h2>
      <p className="settings__note">
        {tx('places.familyPage.othersNote', {
          name: <bdi>{focal.name}</bdi>,
          link: (
            <Link to={`/app/universes/${universe.id}/lore/${focal.entityId}/relations`}>
              {t('places.familyPage.othersLink')}
            </Link>
          ),
        })}
      </p>
      <ul className="family__otherlist">
        {otherRelations.map((relation) => (
          <li key={relation.id} data-testid="family-other-relationship">
            <bdi className="family__othername">{focal.name}</bdi>{' '}
            <bdi className="family__otherlabel">{relation.label}</bdi>{' '}
            <Link
              className="family__otherlink"
              to={`/app/universes/${universe.id}/lore/${relation.relatedEntityId}`}
            >
              <bdi>{relation.relatedEntityName}</bdi>
            </Link>
            {relation.canonStatus === CanonStatus.Canon ? null : (
              <StatusBadge
                step={relation.canonStatus}
                label={t('places.familyPage.relationshipStatus', {
                  status: CANON_LABELS[relation.canonStatus],
                })}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
