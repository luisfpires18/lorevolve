import type { ComponentProps } from 'react'
import { DndContext, DragOverlay, type DragMoveEvent, type useSensors } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { TypeIcon } from '../TypeIcon'
import { useI18n } from '../../i18n'
import type { EntityType } from '../../lore/typeDefinitions'
import { branchIds, type TypeNode } from '../../lore/typeTree'
import { LoreTypeRow as TypeRow } from './LoreTypeRow'

/** The Lore types as one list reordered by the grip: the drag context, its words, each row, and what the pointer carries. */
export function TypeListDnd({
  tree,
  carried,
  sensors,
  dragId,
  setDragId,
  setLifted,
  target,
  setTarget,
  siblingsOf,
  onDragMove,
  reorder,
  ...row
}: Omit<ComponentProps<typeof TypeRow>, 'node'> & {
  sensors: ReturnType<typeof useSensors>
  dragId: string | null
  setDragId: (dragId: string | null) => void
  target: number | null
  siblingsOf: (node: TypeNode) => TypeNode[]
  onDragMove: (event: DragMoveEvent) => void
  reorder: (type: EntityType, to: number) => Promise<void>
}) {
  const { t, tn } = useI18n()
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => {
        setLifted(null)
        setDragId(String(event.active.id))
        const node = tree.byId.get(String(event.active.id))
        setTarget(node ? siblingsOf(node).indexOf(node) : null)
      }}
      onDragMove={onDragMove}
      onDragEnd={(event) => {
        const node = tree.byId.get(String(event.active.id))
        const to = target
        setDragId(null)
        setTarget(null)
        if (node && to !== null) void reorder(node.type, to)
      }}
      onDragCancel={() => {
        setDragId(null)
        setTarget(null)
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable: t('entityTypes.page.dnd.instructions'),
        },
        announcements: {
          onDragStart: ({ active }) =>
            t('entityTypes.page.dnd.pickedUp', {
              name: tree.byId.get(String(active.id))?.type.name ?? t('entityTypes.page.dnd.aType'),
            }),
          onDragOver: () => undefined,
          onDragEnd: ({ active }) =>
            t('entityTypes.page.dnd.dropped', {
              name:
                tree.byId.get(String(active.id))?.type.name ?? t('entityTypes.page.dnd.theType'),
            }),
          onDragCancel: ({ active }) =>
            t('entityTypes.page.dnd.putBack', {
              name:
                tree.byId.get(String(active.id))?.type.name ?? t('entityTypes.page.dnd.theType'),
            }),
        },
      }}
    >
      <ul
        className="types__list"
        data-testid="type-list"
        data-reordering={carried ? 'true' : undefined}
      >
        {tree.ordered.map((node) => (
          <TypeRow
            key={node.type.id}
            node={node}
            tree={tree}
            carried={carried}
            setLifted={setLifted}
            setTarget={setTarget}
            {...row}
          />
        ))}
      </ul>
      {/* What the pointer carries: the row's grip, picture and name - and, for a branch, how much comes with it. */}
      <DragOverlay dropAnimation={null}>
        {dragId && carried ? (
          <div className="types__dragging">
            <GripVertical aria-hidden="true" focusable="false" strokeWidth={1.75} />
            <TypeIcon iconKey={carried.type.icon} />
            <bdi>{carried.type.name}</bdi>
            {branchIds(carried).size > 1 ? (
              <span className="types__draggingnested">
                {tn('entityTypes.page.nested', branchIds(carried).size - 1, {
                  n: branchIds(carried).size - 1,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
