import { useId, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'
import { TypeFields } from '../TypeFields'
import { TypeReorderHandle } from '../TypeReorderHandle'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { useI18n } from '../../i18n'
import type { EntityType, EntityTypeGroup } from '../../lore/typeDefinitions'
import { typePathLabel, type TypeNode, type TypeTree } from '../../lore/typeTree'
import { formatCount } from '../../i18n/format'
import { BlockedCallout } from './FieldBlockedNote'

/** One type in the Types list: its grip, icon, name, groups and count, its actions, description, why it cannot go, and its fields. */
export function LoreTypeRow({
  node,
  tree,
  groups,
  access,
  openTypeId,
  carried,
  dropLine,
  blocked,
  universe,
  refresh,
  moving,
  lifted,
  setLifted,
  setTarget,
  setNotice,
  moveButtons,
  setOpenTypeId,
  setBlocked,
  setEditing,
  onHandleKey,
  move,
  openChild,
  removeType,
}: {
  node: TypeNode
  tree: TypeTree
  groups: EntityTypeGroup[]
  access: { editContent: boolean }
  openTypeId: string | null
  carried: TypeNode | null
  dropLine: { typeId: string; edge: 'before' | 'after' } | null
  blocked: { typeId: string; text: string } | null
  universe: { id: string }
  refresh: () => Promise<void>
  moving: string | null
  lifted: string | null
  setLifted: (lifted: string | null) => void
  setTarget: (target: number | null) => void
  setNotice: (notice: string | null) => void
  moveButtons: { current: Map<string, HTMLButtonElement> }
  setOpenTypeId: (openTypeId: string | null) => void
  setBlocked: (blocked: { typeId: string; text: string } | null) => void
  setEditing: (editing: EntityType) => void
  onHandleKey: (type: EntityType, event: KeyboardEvent<HTMLButtonElement>) => void
  move: (type: EntityType, direction: 'up' | 'down') => Promise<void>
  openChild: (parent: EntityType) => void
  removeType: (type: EntityType) => Promise<void>
}) {
  const { t, tn } = useI18n()
  const type = node.type
  const parent = node.depth === 0 ? null : tree.byId.get(node.path[node.path.length - 2]!.id)!
  const siblings = parent ? parent.children : tree.roots
  const place = siblings.indexOf(node)
  const typeGroups = groups.filter((group) => group.typeIds.includes(type.id))
  const keep = (key: string, element: HTMLButtonElement | null) => {
    if (element) moveButtons.current.set(key, element)
    else moveButtons.current.delete(key)
  }
  const edit = access.editContent
  const fieldsId = useId()
  return (
    <TypeRow
      name={type.name}
      icon={type.icon}
      iconTestId={`type-icon-${type.name}`}
      hiddenPath={
        parent ? t('entityTypes.page.inside', { path: typePathLabel(parent) }) : undefined
      }
      depth={node.depth}
      data-type-id={type.id}
      data-type-name={type.name}
      data-carried={carried?.type.id === type.id ? 'true' : undefined}
      data-drop={dropLine?.typeId === type.id ? dropLine.edge : undefined}
      lead={
        // Wide screens reorder by this grip; a phone keeps Up and Down.
        edit ? (
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
            buttonRef={(element) => keep(`${type.id}:handle`, element)}
          />
        ) : null
      }
      badges={
        typeGroups.length > 0 ? (
          <span className="types__groups" data-testid={`type-groups-${type.name}`}>
            {typeGroups.map((group) => (
              <span className="types__group" key={group.id}>
                <Layers aria-hidden="true" focusable="false" strokeWidth={1.75} />
                <bdi>{group.name}</bdi>
                <span className="visually-hidden"> {t('entityTypes.page.groupSuffix')}</span>
              </span>
            ))}
          </span>
        ) : null
      }
      countTestId={`type-count-${type.name}`}
      count={
        <>
          {tn('entityTypes.page.count', type.entityCount, { n: formatCount(type.entityCount) })}
          {type.trashedEntityCount > 0 ? (
            <span className="types__trashed">
              {type.trashedEntityCount === type.entityCount
                ? type.entityCount === 1
                  ? t('entityTypes.page.trashedOne')
                  : t('entityTypes.page.trashedAll')
                : t('entityTypes.page.trashedSome', { n: type.trashedEntityCount })}
            </span>
          ) : null}
        </>
      }
      actions={
        <TypeRowActions
          name={type.name}
          sibling={
            edit
              ? {
                  index: place,
                  count: siblings.length,
                  busy: moving !== null,
                  to: (_, direction) => void move(type, direction),
                  buttonRef: (direction, element) => keep(`${type.id}:${direction}`, element),
                }
              : undefined
          }
          addChild={
            edit
              ? {
                  onAdd: () => openChild(type),
                  testId: `add-child-${type.name}`,
                  itemTestId: `add-child-item-${type.name}`,
                }
              : undefined
          }
          onEdit={
            edit
              ? () => {
                  setBlocked(null)
                  setEditing(type)
                }
              : undefined
          }
          editTestId={`edit-type-${type.name}`}
          fold={{
            open: openTypeId === type.id,
            count: type.fields.length,
            onToggle: () => setOpenTypeId(openTypeId === type.id ? null : type.id),
            testId: `fields-${type.name}`,
            controls: fieldsId,
          }}
          onDelete={edit ? () => void removeType(type) : undefined}
          deleteTestId={`delete-type-${type.name}`}
          menuTestId={`type-actions-${type.name}`}
        />
      }
    >
      {type.description ? <p className="types__description prose">{type.description}</p> : null}

      {blocked?.typeId === type.id ? (
        <BlockedCallout
          className="types__blocked"
          testId={`type-blocked-${type.name}`}
          text={blocked.text}
        >
          {type.entityCount > type.trashedEntityCount ? (
            <Link to={`/app/universes/${universe.id}/lore?type=${type.id}`}>
              {t('entityTypes.page.showEntries')}
            </Link>
          ) : null}
          {type.trashedEntityCount > 0 ? (
            <Link to={`/app/universes/${universe.id}/trash`}>
              {t('entityTypes.page.openTrash')}
            </Link>
          ) : null}
        </BlockedCallout>
      ) : null}

      {openTypeId === type.id ? (
        <TypeFields
          id={fieldsId}
          universeId={universe.id}
          type={type}
          tree={tree}
          groups={groups}
          canEdit={access.editContent}
          onChanged={refresh}
        />
      ) : null}
    </TypeRow>
  )
}
