import type { KeyboardEvent } from 'react'
import { Layers } from 'lucide-react'
import { TypeIcon } from '../TypeIcon'
import { TypeReorderHandle } from '../TypeReorderHandle'
import { useI18n } from '../../i18n'
import type { EntityType, EntityTypeGroup } from '../../lore/typeDefinitions'
import { typePathLabel, type TypeNode, type TypeTree } from '../../lore/typeTree'
import { TypeRowActions } from './TypeRowActions'

/** A type row's head: the grip, icon, name, groups and count, then the row's actions. */
export function TypeRowHead({
  node,
  type,
  siblings,
  isFirst,
  isLast,
  tree,
  groups,
  access,
  moving,
  lifted,
  setLifted,
  setTarget,
  setNotice,
  moveButtons,
  openTypeId,
  setOpenTypeId,
  setBlocked,
  setEditing,
  onHandleKey,
  move,
  openChild,
  removeType,
}: {
  node: TypeNode
  type: EntityType
  siblings: TypeNode[]
  isFirst: boolean
  isLast: boolean
  tree: TypeTree
  groups: EntityTypeGroup[]
  access: { editContent: boolean }
  moving: string | null
  lifted: string | null
  setLifted: (lifted: string | null) => void
  setTarget: (target: number | null) => void
  setNotice: (notice: string | null) => void
  moveButtons: { current: Map<string, HTMLButtonElement> }
  openTypeId: string | null
  setOpenTypeId: (openTypeId: string | null) => void
  setBlocked: (blocked: { typeId: string; text: string } | null) => void
  setEditing: (editing: EntityType) => void
  onHandleKey: (type: EntityType, event: KeyboardEvent<HTMLButtonElement>) => void
  move: (type: EntityType, direction: 'up' | 'down') => Promise<void>
  openChild: (parent: EntityType) => void
  removeType: (type: EntityType) => Promise<void>
}) {
  const { t, tn } = useI18n()
  return (
    <div className="types__head">
      {/* Wide screens reorder by this grip; a phone keeps Up and Down. */}
      {access.editContent ? (
        <TypeReorderHandle
          id={type.id}
          name={type.name}
          lifted={lifted === type.id}
          disabled={moving !== null || siblings.length < 2}
          onKey={(event) => onHandleKey(type, event)}
          onLeave={() => {
            if (lifted !== type.id) return
            setLifted(null)
            setTarget(null)
            setNotice(t('entityTypes.page.putBackWhereItWas', { name: type.name }))
          }}
          buttonRef={(element) => {
            const key = `${type.id}:handle`
            if (element) moveButtons.current.set(key, element)
            else moveButtons.current.delete(key)
          }}
        />
      ) : null}
      <span className="types__icon" data-testid={`type-icon-${type.name}`}>
        <TypeIcon iconKey={type.icon} />
      </span>
      <span className="types__name">
        <bdi>{type.name}</bdi>
        {node.depth > 0 ? (
          <span className="visually-hidden">
            {t('entityTypes.page.inside', {
              path: typePathLabel(tree.byId.get(node.path[node.path.length - 2]!.id)!),
            })}
          </span>
        ) : null}
      </span>
      {groups.some((group) => group.typeIds.includes(type.id)) ? (
        <span className="types__groups" data-testid={`type-groups-${type.name}`}>
          {groups
            .filter((group) => group.typeIds.includes(type.id))
            .map((group) => (
              <span className="types__group" key={group.id}>
                <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} />
                <bdi>{group.name}</bdi>
                <span className="visually-hidden"> {t('entityTypes.page.groupSuffix')}</span>
              </span>
            ))}
        </span>
      ) : null}
      <span className="types__count" data-testid={`type-count-${type.name}`}>
        {tn('entityTypes.page.count', type.entityCount, { n: type.entityCount })}
        {type.trashedEntityCount > 0 ? (
          <span className="types__trashed">
            {type.trashedEntityCount === type.entityCount
              ? type.entityCount === 1
                ? t('entityTypes.page.trashedOne')
                : t('entityTypes.page.trashedAll')
              : t('entityTypes.page.trashedSome', { n: type.trashedEntityCount })}
          </span>
        ) : null}
      </span>
      <TypeRowActions
        type={type}
        access={access}
        isFirst={isFirst}
        isLast={isLast}
        moving={moving}
        moveButtons={moveButtons}
        openTypeId={openTypeId}
        setOpenTypeId={setOpenTypeId}
        setBlocked={setBlocked}
        setEditing={setEditing}
        move={move}
        openChild={openChild}
        removeType={removeType}
      />
    </div>
  )
}
