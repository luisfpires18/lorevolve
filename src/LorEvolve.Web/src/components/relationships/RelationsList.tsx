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
import { QuietNote } from '../QuietNote'

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
    <QuietNote size="body" className="relations__quiet" role="status">
      {t('relationships.section.readingRelations')}
    </QuietNote>
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
    <GroupedRows
      level={3}
      testId="relationship-list"
      groups={byReading(views).map(([label, group]) => ({
        label,
        rows: group.map((view) =>
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
        ),
      }))}
    />
  )
}

/**
 * Rows under a heading per group, in the order given: the Relationships list (by reading) and the Knowledge lists (by
 * story). Each group is keyed by its label; the rows are the caller's, already keyed.
 */
export function GroupedRows({
  groups,
  level,
  className,
  testId,
}: {
  groups: { label: string; rows: ReactNode }[]
  level: 3 | 4
  className?: string
  testId: string
}) {
  return (
    <ul
      className={className ? `relations__list ${className}` : 'relations__list'}
      data-testid={testId}
    >
      {groups.map((group) => (
        <li className="relations__group" key={group.label}>
          <SectionTitle level={level} tone="label">
            <bdi>{group.label}</bdi>
          </SectionTitle>
          <ul className="relations__rows">{group.rows}</ul>
        </li>
      ))}
    </ul>
  )
}
