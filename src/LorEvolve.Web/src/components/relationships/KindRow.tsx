import { t, tn } from '../../i18n'
import type { RelationshipType } from '../../relationships/types'
import type { Dispatch, SetStateAction } from 'react'
import type { useUniverseAccess } from '../../universes/access'
import { draftFrom, type TypeDraft } from '../../relationships/typeDraft'
import { constraintSummary, familySummary, reading } from '../../relationships/typeSummaries'
import { Button } from '../Button'

export function KindRow({
  type,
  access,
  remove,
  setMessage,
  setFieldErrors,
  setIsAdding,
  setEditingId,
  setDraft,
}: {
  type: RelationshipType
  access: ReturnType<typeof useUniverseAccess>
  remove: (type: RelationshipType) => Promise<void>
  setMessage: Dispatch<SetStateAction<string | null>>
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>
  setIsAdding: Dispatch<SetStateAction<boolean>>
  setEditingId: Dispatch<SetStateAction<string | null>>
  setDraft: Dispatch<SetStateAction<TypeDraft>>
}) {
  const summary = constraintSummary(type.canonConstraints)
  const family = familySummary(type.familySemantic)

  return (
    <li className="types__row" data-reltype-name={type.name}>
      <div className="types__head">
        <span className="types__name">
          <bdi>{type.name}</bdi>
        </span>
        <span className="types__count">
          {tn('relationships.types.relationCount', type.relationshipCount, {
            n: type.relationshipCount,
          })}
        </span>
        {access.editContent ? (
          <Button
            tone="secondary"
            size="sm"
            onClick={() => {
              setMessage(null)
              setFieldErrors({})
              setIsAdding(false)
              setEditingId(type.id)
              setDraft(draftFrom(type))
            }}
            data-testid={`edit-reltype-${type.name}`}
          >
            {t('relationships.types.edit')}
          </Button>
        ) : null}
        {access.editContent && type.relationshipCount === 0 ? (
          <Button
            tone="danger-quiet"
            size="sm"
            onClick={() => remove(type)}
            data-testid={`delete-reltype-${type.name}`}
          >
            {t('relationships.types.delete')}
          </Button>
        ) : null}
      </div>

      <p className="types__description">{reading(type)}</p>
      {summary ? (
        <p
          className="types__description reltype__rule"
          data-testid={`reltype-constraints-${type.name}`}
        >
          {summary}
        </p>
      ) : null}
      {family ? (
        <p className="types__description reltype__rule" data-testid={`reltype-family-${type.name}`}>
          {family}
        </p>
      ) : null}
      {type.description ? <p className="types__description prose">{type.description}</p> : null}
    </li>
  )
}
