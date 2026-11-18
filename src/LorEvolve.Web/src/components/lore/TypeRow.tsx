import type { ComponentProps } from 'react'
import { Link } from 'react-router-dom'
import { TypeFields } from '../TypeFields'
import { useI18n } from '../../i18n'
import type { TypeNode } from '../../lore/typeTree'
import { TypeRowHead } from './TypeRowHead'

/** One type in the Types list: its place among its siblings, its head, description, why it cannot go, and its fields. */
export function TypeRow({
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
  ...head
}: Omit<ComponentProps<typeof TypeRowHead>, 'type' | 'siblings' | 'isFirst' | 'isLast'> & {
  carried: TypeNode | null
  dropLine: { typeId: string; edge: 'before' | 'after' } | null
  blocked: { typeId: string; text: string } | null
  universe: { id: string }
  refresh: () => Promise<void>
}) {
  const { t } = useI18n()
  const type = node.type
  const siblings =
    node.depth === 0 ? tree.roots : tree.byId.get(node.path[node.path.length - 2]!.id)!.children
  const place = siblings.indexOf(node)
  const isFirst = place === 0
  const isLast = place === siblings.length - 1
  return (
    <li
      className="types__row"
      data-type-id={type.id}
      data-type-name={type.name}
      data-carried={carried?.type.id === type.id ? 'true' : undefined}
      data-drop={dropLine?.typeId === type.id ? dropLine.edge : undefined}
      data-depth={node.depth}
      style={{ ['--depth' as string]: Math.min(node.depth, 6) }}
    >
      <TypeRowHead
        node={node}
        type={type}
        siblings={siblings}
        isFirst={isFirst}
        isLast={isLast}
        tree={tree}
        groups={groups}
        access={access}
        openTypeId={openTypeId}
        {...head}
      />

      {type.description ? <p className="types__description prose">{type.description}</p> : null}

      {blocked?.typeId === type.id ? (
        <div
          className="callout callout--warning types__blocked"
          role="alert"
          data-testid={`type-blocked-${type.name}`}
        >
          <p className="types__blockedtext">{blocked.text}</p>
          <p className="types__blockedlinks">
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
          </p>
        </div>
      ) : null}

      {openTypeId === type.id ? (
        <TypeFields
          universeId={universe.id}
          type={type}
          tree={tree}
          groups={groups}
          canEdit={access.editContent}
          onChanged={refresh}
        />
      ) : null}
    </li>
  )
}
