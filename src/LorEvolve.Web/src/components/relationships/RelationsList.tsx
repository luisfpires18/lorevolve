import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { Chronology } from '../../chronology/types'
import type { RelationshipType, RelationshipView } from '../../relationships/types'
import { EmptyState } from '../EmptyState'
import type { ReactNode } from 'react'
import type { useUniverseAccess } from '../../universes/access'
import type { useRelationsState } from '../../relationships/useRelationsState'
import { byReading } from '../../relationships/relationDraft'
import { RelationRow } from './RelationRow'
import { SectionTitle } from '../Section'

export function RelationsList({
  views,
  types,
  isAdding,
  editingId,
  shownAt,
  readError,
  universeId,
  chronology,
  access,
  form,
  openEdit,
  remove,
}: {
  views: RelationshipView[] | null
  types: RelationshipType[]
  isAdding: boolean
  editingId: string | null
  shownAt: ReturnType<typeof useRelationsState>['shownAt']
  readError: string | null
  universeId: string
  chronology: Chronology
  access: ReturnType<typeof useUniverseAccess>
  form: ReactNode
  openEdit: (view: RelationshipView) => Promise<void>
  remove: (view: RelationshipView) => Promise<void>
}) {
  const { t, tx } = useI18n()

  return views === null ? (
    <p className="relations__quiet" role="status">
      {t('relationships.section.readingRelations')}
    </p>
  ) : views.length === 0 && !isAdding ? (
    <EmptyState
      testId="relations-empty"
      title={
        shownAt
          ? t('relationships.section.noneThen')
          : readError
            ? t('relationships.section.nothingShown')
            : types.length === 0
              ? tx('relationships.section.needKind', {
                  link: (
                    <Link to={`/app/universes/${universeId}/types`}>
                      {t('relationships.section.typesLink')}
                    </Link>
                  ),
                })
              : t('relationships.section.empty')
      }
    />
  ) : (
    <ul className="relations__list" data-testid="relationship-list">
      {byReading(views).map(([label, group]) => (
        <li className="relations__group" key={label}>
          <SectionTitle level={3} tone="label">
            <bdi>{label}</bdi>
          </SectionTitle>
          <ul className="relations__rows">
            {group.map((view) =>
              editingId === view.id ? (
                <li className="relations__editing" key={view.id}>
                  {form}
                </li>
              ) : (
                <RelationRow
                  key={view.id}
                  view={view}
                  universeId={universeId}
                  chronology={chronology}
                  access={access}
                  openEdit={openEdit}
                  remove={remove}
                />
              ),
            )}
          </ul>
        </li>
      ))}
    </ul>
  )
}
