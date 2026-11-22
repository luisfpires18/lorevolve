import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { formatSpan } from '../../lib/dates'
import type { Chronology } from '../../chronology/types'
import { periodText } from '../../relationships/periods'
import { Validity, type RelationshipView } from '../../relationships/types'
import { CanonBadge } from '../CanonBadge'
import { RowMenu } from '../RowMenu'
import { EntityRow } from '../EntityRow'
import type { useUniverseAccess } from '../../universes/access'

export function RelationRow({
  view,
  universeId,
  chronology,
  access,
  openEdit,
  remove,
}: {
  view: RelationshipView
  universeId: string
  chronology: Chronology
  access: ReturnType<typeof useUniverseAccess>
  openEdit: (view: RelationshipView) => Promise<void>
  remove: (view: RelationshipView) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <li className="relation" data-relation-label={view.label}>
      <EntityRow
        universeId={universeId}
        entityId={view.relatedEntityId}
        image={null}
        typeIcon={view.relatedEntityTypeIcon}
        typeAccent={view.relatedEntityTypeAccentColor}
        name={
          <Link
            className="relation__name"
            to={`/app/universes/${universeId}/lore/${view.relatedEntityId}`}
          >
            <bdi>{view.relatedEntityName}</bdi>
          </Link>
        }
        meta={
          <>
            <span className="relation__kind">
              <bdi>{view.relatedEntityTypeName}</bdi>
            </span>
            <CanonBadge status={view.canonStatus} />
            {(view.periods ?? []).length > 0 ? (
              <span className="relation__span" data-testid="relation-periods-text">
                {(view.periods ?? []).map((period) => periodText(period, chronology)).join('; ')}
              </span>
            ) : null}
            {formatSpan(view.startDate, view.endDate) ? (
              <span className="relation__span">
                {t('relationships.section.realWorld', {
                  span: formatSpan(view.startDate, view.endDate) ?? '',
                })}
              </span>
            ) : null}
            {view.validity === Validity.Timeless ? (
              <span className="relation__validity">{t('relationships.section.always')}</span>
            ) : view.validity === Validity.Unplaced ? (
              <span className="relation__validity" data-testid="relation-unplaced">
                {t('relationships.section.unplaced')}
              </span>
            ) : null}
          </>
        }
      >
        {view.notes ? <p className="relation__notes prose">{view.notes}</p> : null}
      </EntityRow>

      {access.editContent ? (
        <RowMenu
          className="relation__menu"
          label={t('relationships.section.moreActions', {
            label: view.label,
            related: view.relatedEntityName,
          })}
          triggerTestId={`relationship-actions-${view.relatedEntityName}`}
          onEdit={() => openEdit(view)}
          editLabel={t('relationships.section.edit')}
          editTestId={`edit-relationship-${view.relatedEntityName}`}
          divided
          onRemove={() => void remove(view)}
          removeLabel={t('relationships.section.remove')}
          removeTestId={`delete-relationship-${view.relatedEntityName}`}
        />
      ) : null}
    </li>
  )
}
