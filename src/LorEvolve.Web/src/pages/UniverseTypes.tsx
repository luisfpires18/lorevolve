import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useOutletContext } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, ListTree, Pencil, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { Field } from '../components/Field'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import { RelationshipTypeManager } from '../components/RelationshipTypeManager'
import { TypeIcon } from '../components/TypeIcon'
import { TypeIconPicker } from '../components/TypeIconPicker'
import { TypeReorderHandle } from '../components/TypeReorderHandle'
import { TypeFields } from '../components/TypeFields'
import { TypeGroupsField, type GroupChoice } from '../components/TypeGroupsField'
import { ValidationTermManager } from '../components/ValidationTermManager'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import {
  createEntityType,
  deleteEntityType,
  listEntityTypeGroups,
  listEntityTypes,
  moveEntityType,
  reorderEntityType,
  updateEntityType,
} from '../lore/api'
import { type EntityType, type EntityTypeGroup } from '../lore/types'
import {
  buildTypeTree,
  branchIds,
  typePathLabel,
  type TypeNode,
  type TypeTree,
} from '../lore/typeTree'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { confirmAction } from '../lib/confirm'

/** Three vocabularies, one screen: kept apart as tabs so none of them is a long scroll below another. */
const TABS = [
  { id: 'lore', label: 'Lore Types' },
  { id: 'relations', label: 'Relation Kinds' },
  { id: 'events', label: 'Event Kinds & Methods' },
] as const

const LEDES: Record<(typeof TABS)[number]['id'], string> = {
  lore: 'Every entry is one of these. Add your own, nest one inside another to organise Lore, and give each the fields this world actually needs.',
  relations:
    'How entries connect: each kind’s two readings, its Canon constraints and its family meaning.',
  events: 'The event kinds and methods a moment and a world rule’s check can name.',
}

/**
 * The universe's vocabularies (Product refinement 016): Lore Types, Relation Kinds, and Event Kinds & Methods, each a tab
 * in the address (`?tab=`) as real steps of history - Back and Forward walk the tabs, unlike Settings. Every panel stays mounted, so a half-written relation kind
 * survives a look at another tab.
 */
export default function UniverseTypes() {
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const [tab, chooseTab] = useQueryTab(TABS, { history: 'push' })

  const [types, setTypes] = useState<EntityType[] | null>(null)
  const [groups, setGroups] = useState<EntityTypeGroup[]>([])
  const [message, setMessage] = useState<string | null>(null)
  // The type editor: a new type, or the existing one being edited. One drawer for both. A new type opened from a row's
  // Add child starts inside that row's type.
  const [editing, setEditing] = useState<EntityType | 'new' | null>(null)
  const [childOf, setChildOf] = useState<EntityType | null>(null)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  // Why one type cannot be deleted, said under it: counted from the list, or the API's own words if it refused.
  const [blocked, setBlocked] = useState<{ typeId: string; text: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  // One move at a time; the button that asked keeps the focus once its row has moved (React moves the row's node, which
  // a browser does not keep focused on its own).
  const [moving, setMoving] = useState<string | null>(null)
  const moveButtons = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (!refocus.current) return
    moveButtons.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [types])

  // Reordering by the grip (wide screens). `target` is where the type being carried would land among its siblings - from a
  // mouse drag or from the keyboard - and is drawn as a line at that place; `lifted` is a keyboard carry in progress.
  const [dragId, setDragId] = useState<string | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  // A mouse only, and only after it has moved a little: a click on the grip is not a drag, and a finger never is one.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }))

  /** The type's own sibling group - its parent's children, or the roots - which is all it can be reordered among. */
  function siblingsOf(node: TypeNode) {
    return node.depth === 0
      ? tree.roots
      : tree.byId.get(node.path[node.path.length - 2]!.id)!.children
  }

  /** The row a branch ends on: the type's last descendant, or the type itself. */
  function lastOf(node: TypeNode): TypeNode {
    return node.children.length > 0 ? lastOf(node.children[node.children.length - 1]!) : node
  }

  /**
   * Which sibling's place a pointer at `y` points to: the sibling whose whole branch - its row and every row nested under it
   * - holds `y`, or the nearest one. Only siblings are ever candidates, so a drop can never land inside another branch or
   * under another parent, however far the pointer drifts.
   */
  function placeAt(node: TypeNode, y: number) {
    const siblings = siblingsOf(node)
    let best = siblings.indexOf(node)
    let distance = Number.POSITIVE_INFINITY
    siblings.forEach((sibling, index) => {
      const top = rowOf(sibling.type.id)?.getBoundingClientRect().top
      const bottom = rowOf(lastOf(sibling).type.id)?.getBoundingClientRect().bottom
      if (top === undefined || bottom === undefined) return
      const away = y < top ? top - y : y > bottom ? y - bottom : 0
      if (away < distance) {
        distance = away
        best = index
      }
    })
    return best
  }

  function rowOf(typeId: string) {
    return document.querySelector<HTMLElement>(`.types__row[data-type-id="${typeId}"]`)
  }

  function onDragMove(event: DragMoveEvent) {
    const node = tree.byId.get(String(event.active.id))
    const start = event.activatorEvent as MouseEvent
    if (!node || typeof start.clientY !== 'number') return
    const next = placeAt(node, start.clientY + event.delta.y)
    if (next !== target) setTarget(next)
  }

  /**
   * Puts a type at `to` among its siblings: the list shows it there at once, one request makes it so, and the server's list
   * replaces the guess. A refusal puts the order back as it was and says why; a type that has moved since this screen read
   * the list reloads it.
   */
  async function reorder(type: EntityType, to: number) {
    const node = tree.byId.get(type.id)
    if (!node || moving || !types) return
    const siblings = siblingsOf(node)
    const from = siblings.indexOf(node)
    if (to === from || to < 0 || to >= siblings.length) return

    const previous = types
    const order = siblings.map((sibling) => sibling.type.id)
    order.splice(from, 1)
    order.splice(to, 0, type.id)
    const place = new Map(order.map((id, index) => [id, index + 1]))
    setTypes(
      previous.map((each) =>
        place.has(each.id) ? { ...each, displayOrder: place.get(each.id)! } : each,
      ),
    )

    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const reordered = await reorderEntityType(universe.id, type.id, to, type.parentId)
      refocus.current = `${type.id}:handle`
      setTypes(reordered)
      setNotice(`Moved “${type.name}” to place ${to + 1} of ${siblings.length}.`)
    } catch (error: unknown) {
      setTypes(previous)
      refocus.current = `${type.id}:handle`
      report(error, 'That type could not be moved.')
      if (error instanceof ApiError && error.status === 409) await refresh().catch(() => undefined)
    } finally {
      setMoving(null)
    }
  }

  /** The grip from the keyboard: Space or Enter lifts and drops, the arrows move among siblings, Escape puts it back. */
  function onHandleKey(type: EntityType, event: KeyboardEvent<HTMLButtonElement>) {
    const node = tree.byId.get(type.id)
    if (!node) return
    const siblings = siblingsOf(node)
    const from = siblings.indexOf(node)
    const isLifted = lifted === type.id
    // Alone among its siblings, there is nowhere for it to go.
    if (siblings.length < 2) return
    const say = (to: number) => `place ${to + 1} of ${siblings.length} among its siblings`

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (moving) return
      if (!isLifted) {
        setLifted(type.id)
        setTarget(from)
        setNotice(
          `Lifted “${type.name}”, at ${say(from)}. Up and down arrows move it, Space drops it, Escape puts it back.`,
        )
      } else {
        const to = target ?? from
        setLifted(null)
        setTarget(null)
        if (to === from) setNotice(`“${type.name}” stays at ${say(from)}.`)
        else void reorder(type, to)
      }
    } else if (isLifted && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const to = Math.min(
        siblings.length - 1,
        Math.max(0, (target ?? from) + (event.key === 'ArrowUp' ? -1 : 1)),
      )
      setTarget(to)
      setNotice(`“${type.name}”: ${say(to)}.`)
    } else if (isLifted && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setLifted(null)
      setTarget(null)
      setNotice(`Put back. “${type.name}” stays at ${say(from)}.`)
    }
  }

  // The type being carried, by the mouse or the keyboard, and the line showing where it would land.
  const carried = tree.byId.get(dragId ?? lifted ?? '') ?? null
  const carriedFrom = carried ? siblingsOf(carried).indexOf(carried) : -1
  const dropLine = (() => {
    if (!carried || target === null || target === carriedFrom) return null
    const at = siblingsOf(carried)[target]!
    // Up: above the sibling it takes the place of. Down: below that sibling's whole branch.
    return target < carriedFrom
      ? { typeId: at.type.id, edge: 'before' as const }
      : { typeId: lastOf(at).type.id, edge: 'after' as const }
  })()

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        // Leaving the screen aborts this read. That is not a failure to report: the message
        // belongs to a request that was answered badly, not to one LorEvolve cancelled itself.
        if (controller.signal.aborted) return
        setMessage('The types could not be loaded.')
      })
    // Groups are an extra: without them the types still work, and the group controls simply have none to offer.
    listEntityTypeGroups(universe.id, controller.signal)
      .then(setGroups)
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id])

  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  async function refresh() {
    const [nextTypes, nextGroups] = await Promise.all([
      listEntityTypes(universe.id),
      listEntityTypeGroups(universe.id),
    ])
    setTypes(nextTypes)
    setGroups(nextGroups)
  }

  async function refreshGroups() {
    setGroups(await listEntityTypeGroups(universe.id))
  }

  /** One place up or down among the type's own siblings; the list comes back from the move itself. */
  async function move(type: EntityType, direction: 'up' | 'down') {
    if (moving) return
    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const moved = await moveEntityType(universe.id, type.id, direction)
      refocus.current = `${type.id}:${direction}`
      setTypes(moved)
      setNotice(`Moved “${type.name}” ${direction}.`)
    } catch (error: unknown) {
      report(error, 'That type could not be moved.')
    } finally {
      setMoving(null)
    }
  }

  /**
   * Deleting a type. A type any entry still uses - in Lore or in the Trash, since an entry there keeps its type - is not
   * offered a confirmation it could only fail: the author is told, under the type, exactly what uses it and where to
   * go. An unused type asks once, as every irreversible action in LorEvolve does, and is gone.
   */
  async function removeType(type: EntityType) {
    setMessage(null)
    setNotice(null)
    setBlocked(null)

    // Nested types hold it too: never deleted with it, never promoted or moved somewhere the author did not choose.
    const children = tree.byId.get(type.id)?.children.length ?? 0
    if (type.entityCount > 0 || children > 0) {
      setBlocked({
        typeId: type.id,
        text: inUseDetail(
          type.name,
          type.entityCount - type.trashedEntityCount,
          type.trashedEntityCount,
          children,
        ),
      })
      return
    }

    // A link field on another type limited to this one - archived ones too, which keep their limit - is the same refusal the
    // API gives, said before asking.
    const targeting = (types ?? []).flatMap((owner) =>
      owner.id === type.id
        ? []
        : [...owner.fields, ...(owner.archivedFields ?? [])]
            .filter((field) => field.targetEntityTypeId === type.id)
            .map((field) => ({
              field: field.name,
              archived: field.archivedAt !== null,
              owner: owner.name,
            })),
    )
    if (targeting.length > 0) {
      setBlocked({ typeId: type.id, text: targetedDetail(type.name, targeting) })
      return
    }

    if (
      !(await confirmAction({
        title: (
          <>
            Delete the type “<bdi>{type.name}</bdi>”?
          </>
        ),
        message: 'No entry uses it. This cannot be undone.',
        confirmLabel: 'Delete type',
        variant: 'destructive',
      }))
    ) {
      return
    }

    try {
      await deleteEntityType(universe.id, type.id)
      setNotice(`Deleted the type “${type.name}”.`)
      if (openTypeId === type.id) setOpenTypeId(null)
      await refresh()
    } catch (error: unknown) {
      // Used since the list was read - another tab, or the entry form - so the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ typeId: type.id, text: error.message })
        await refresh().catch(() => undefined)
      } else {
        report(error, 'That type could not be deleted.')
      }
    }
  }

  function openChild(parent: EntityType) {
    setBlocked(null)
    setChildOf(parent)
    setEditing('new')
  }

  return (
    <article className="types">
      <PageHeader
        title="Types"
        lede={LEDES[tab]}
        actions={
          tab === 'lore' && access.editContent ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                setChildOf(null)
                setEditing('new')
              }}
              data-testid="new-type"
            >
              <ActionIcon icon={Plus} />
              New type
            </button>
          ) : null
        }
      >
        <QueryTabList label="Types" idPrefix="types" tabs={TABS} tab={tab} onChoose={chooseTab} />
      </PageHeader>

      {editing ? (
        <TypeDialog
          universeId={universe.id}
          tree={tree}
          type={editing === 'new' ? null : editing}
          initialParent={editing === 'new' ? childOf : null}
          groups={groups}
          types={types ?? []}
          onGroupsChanged={refreshGroups}
          onClose={() => setEditing(null)}
          onSaved={async (savedName, parentId) => {
            const wasNew = editing === 'new'
            // Made from a row's Add child: said with where it went, which is where the author chose in the end.
            const parent =
              wasNew && childOf && parentId ? tree.byId.get(parentId)?.type.name : undefined
            setEditing(null)
            setBlocked(null)
            setNotice(
              parent
                ? `Created “${savedName}” inside “${parent}”.`
                : wasNew
                  ? `Created the type “${savedName}”.`
                  : `Saved the type “${savedName}”.`,
            )
            await refresh()
          }}
        />
      ) : null}

      <TabPanel idPrefix="types" id="lore" tab={tab}>
        {message ? (
          <p className="form__message" role="alert" data-testid="types-error">
            {message}
          </p>
        ) : null}

        <p className="types__notice" role="status" data-testid="types-notice">
          {notice}
        </p>

        {!types ? (
          <p className="notice" role="status">
            Reading the types…
          </p>
        ) : (
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
                draggable:
                  'Press Space or Enter to lift this type, the up and down arrows to move it among its siblings, and ' +
                  'Space or Enter again to drop it, or Escape to put it back. It never moves to another parent.',
              },
              announcements: {
                onDragStart: ({ active }) =>
                  `Picked up ${tree.byId.get(String(active.id))?.type.name ?? 'a type'}.`,
                onDragOver: () => undefined,
                onDragEnd: ({ active }) =>
                  `Dropped ${tree.byId.get(String(active.id))?.type.name ?? 'the type'}.`,
                onDragCancel: ({ active }) =>
                  `Put back ${tree.byId.get(String(active.id))?.type.name ?? 'the type'}.`,
              },
            }}
          >
            <ul
              className="types__list"
              data-testid="type-list"
              data-reordering={carried ? 'true' : undefined}
            >
              {tree.ordered.map((node) => {
                const type = node.type
                const siblings =
                  node.depth === 0
                    ? tree.roots
                    : tree.byId.get(node.path[node.path.length - 2]!.id)!.children
                const place = siblings.indexOf(node)
                const isFirst = place === 0
                const isLast = place === siblings.length - 1
                return (
                  <li
                    className="types__row"
                    key={type.id}
                    data-type-id={type.id}
                    data-type-name={type.name}
                    data-carried={carried?.type.id === type.id ? 'true' : undefined}
                    data-drop={dropLine?.typeId === type.id ? dropLine.edge : undefined}
                    data-depth={node.depth}
                    style={{ ['--depth' as string]: Math.min(node.depth, 6) }}
                  >
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
                            setNotice(`Put back. “${type.name}” stays where it was.`)
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
                            , inside{' '}
                            {typePathLabel(tree.byId.get(node.path[node.path.length - 2]!.id)!)}
                          </span>
                        ) : null}
                      </span>
                      <span className="types__count" data-testid={`type-count-${type.name}`}>
                        {type.entityCount === 1 ? '1 entry' : `${type.entityCount} entries`}
                        {type.trashedEntityCount > 0 ? (
                          <span className="types__trashed">
                            {type.trashedEntityCount === type.entityCount
                              ? type.entityCount === 1
                                ? ', in the Trash'
                                : ', all in the Trash'
                              : `, ${type.trashedEntityCount} in the Trash`}
                          </span>
                        ) : null}
                      </span>
                      <span className="types__actions">
                        {access.editContent ? (
                          <>
                            <span
                              className="types__move"
                              role="group"
                              aria-label={`Order of ${type.name}`}
                            >
                              {(['up', 'down'] as const).map((direction) => {
                                const isEnd = direction === 'up' ? isFirst : isLast
                                return (
                                  <button
                                    key={direction}
                                    ref={(element) => {
                                      const key = `${type.id}:${direction}`
                                      if (element) moveButtons.current.set(key, element)
                                      else moveButtons.current.delete(key)
                                    }}
                                    className="button button--text button--sm types__movebutton"
                                    type="button"
                                    aria-disabled={isEnd || moving !== null || undefined}
                                    aria-label={`Move ${type.name} ${direction}`}
                                    title={
                                      isEnd
                                        ? direction === 'up'
                                          ? 'Already first among its siblings'
                                          : 'Already last among its siblings'
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!isEnd) void move(type, direction)
                                    }}
                                    data-testid={`move-${direction}-${type.name}`}
                                  >
                                    <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                                    {direction === 'up' ? 'Up' : 'Down'}
                                  </button>
                                )
                              })}
                            </span>
                            {/* A type straight inside this one, its parent already chosen - the quick way to build a branch.
                          Quiet like Up and Down; on a phone it waits in the row's menu instead. Coming back from the
                          drawer, the focus is on this button again, ready for the next sibling. */}
                            <button
                              className="button button--text button--sm types__addchild"
                              type="button"
                              onClick={() => openChild(type)}
                              aria-label={`Add child type inside ${type.name}`}
                              data-testid={`add-child-${type.name}`}
                            >
                              <ActionIcon icon={ListTree} />
                              Add child
                            </button>
                            <button
                              className="button button--secondary button--sm"
                              type="button"
                              onClick={() => {
                                setBlocked(null)
                                setEditing(type)
                              }}
                              aria-label={`Edit ${type.name}`}
                              data-testid={`edit-type-${type.name}`}
                            >
                              <ActionIcon icon={Pencil} />
                              Edit
                            </button>
                          </>
                        ) : null}
                        <button
                          className="button button--secondary button--sm"
                          type="button"
                          aria-expanded={openTypeId === type.id}
                          aria-label={`Fields of ${type.name}`}
                          onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                          data-testid={`fields-${type.name}`}
                        >
                          Fields
                          {type.fields.length > 0 ? (
                            <span className="types__fieldcount">{type.fields.length}</span>
                          ) : null}
                        </button>
                        {access.editContent ? (
                          <ActionMenu
                            label={`More actions for ${type.name}`}
                            triggerTestId={`type-actions-${type.name}`}
                          >
                            <button
                              className="actionmenu__item types__addchilditem"
                              type="button"
                              onClick={() => openChild(type)}
                              aria-label={`Add child type inside ${type.name}`}
                              data-testid={`add-child-item-${type.name}`}
                            >
                              <ActionIcon icon={ListTree} />
                              Add child type
                            </button>
                            {/* The grip's plain alternative on a wide screen, where Up and Down are not set out on the row. */}
                            {(['up', 'down'] as const).map((direction) =>
                              (direction === 'up' ? isFirst : isLast) ? null : (
                                <button
                                  key={direction}
                                  className="actionmenu__item types__moveitem"
                                  type="button"
                                  onClick={() => void move(type, direction)}
                                  disabled={moving !== null}
                                  data-testid={`move-${direction}-item-${type.name}`}
                                >
                                  <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                                  {direction === 'up' ? 'Move up' : 'Move down'}
                                </button>
                              ),
                            )}
                            <button
                              className="actionmenu__item actionmenu__item--danger"
                              type="button"
                              onClick={() => void removeType(type)}
                              data-testid={`delete-type-${type.name}`}
                            >
                              Delete type
                            </button>
                          </ActionMenu>
                        ) : null}
                      </span>
                    </div>

                    {type.description ? (
                      <p className="types__description prose">{type.description}</p>
                    ) : null}

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
                              Show its entries in Lore
                            </Link>
                          ) : null}
                          {type.trashedEntityCount > 0 ? (
                            <Link to={`/app/universes/${universe.id}/trash`}>Open the Trash</Link>
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
              })}
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
                      + {branchIds(carried).size - 1} nested{' '}
                      {branchIds(carried).size === 2 ? 'type' : 'types'}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </TabPanel>

      <TabPanel idPrefix="types" id="relations" tab={tab}>
        <RelationshipTypeManager universeId={universe.id} />
      </TabPanel>

      <TabPanel idPrefix="types" id="events" tab={tab}>
        <ValidationTermManager universeId={universe.id} />
      </TabPanel>
    </article>
  )
}

/**
 * Why a type a link field is limited to cannot be deleted: the same sentence the API's refusal carries
 * (`EntityTypeEndpoints.DeleteAsync`), naming the first field by its type's and its own name and counting the rest.
 */
function targetedDetail(
  name: string,
  targeting: { field: string; archived: boolean; owner: string }[],
) {
  const ordered = [...targeting].sort((a, b) =>
    a.owner === b.owner ? (a.field < b.field ? -1 : 1) : a.owner < b.owner ? -1 : 1,
  )
  const first = ordered[0]
  const others = ordered.length - 1
  const rest =
    others === 0 ? '' : others === 1 ? ' and 1 other field' : ` and ${others} other fields`
  const mark = first.archived ? ' (archived)' : ''
  return `${name} can't be deleted because the field "${first.field}"${mark} on ${first.owner}${rest} can only link to it. Change those fields to allow another type first.`
}

/**
 * Why a type cannot be deleted, in the author's terms. The same sentence the API's refusal carries
 * (`EntityTypeEndpoints.InUseDetail`), said from the list before anything is sent: an entry in the Trash is out of sight in
 * Lore and still keeps its type, so it is named.
 */
function inUseDetail(name: string, live: number, trashed: number, children = 0) {
  const nested = children === 1 ? '1 nested type' : `${children} nested types`
  if (live + trashed === 0) {
    return `${name} can't be deleted because it still contains ${nested}. Move or delete those types first.`
  }
  const total = live + trashed
  const uses = total === 1 ? '1 entry still uses it' : `${total} entries still use it`
  const where =
    trashed === 0
      ? ''
      : trashed === total
        ? total === 1
          ? ', and it is in the Trash'
          : ', all of them in the Trash'
        : `, ${trashed} of them in the Trash`
  const fix =
    total === 1
      ? trashed === 0
        ? 'Move it to another type first.'
        : 'Restore it from the Trash, then move it to another type.'
      : trashed === 0
        ? 'Move them to another type first.'
        : 'Move them to another type first; an entry in the Trash has to be restored before it can be moved.'
  return children === 0
    ? `${name} can't be deleted because ${uses}${where}. ${fix}`
    : `${name} can't be deleted because ${uses}${where}, and it still contains ${nested}. ${fix} ` +
        (children === 1 ? 'Move or delete that type too.' : 'Move or delete those types too.')
}

/**
 * One Lore Type, new or existing. A new type is given its name, its icon, and whether its entries take part in the Family
 * Tree - the only things a type needs before its first entry. An existing one edits its name and icon only: the Family
 * Tree choice is the first of a type's constraints, and those get a surface of their own rather than one more checkbox
 * here, so an edit sends the stored choice back untouched. Fields are managed on the type.
 * In the drawer every LorEvolve form uses, so focus goes in, Escape asks before an edit is lost, and focus returns to the
 * button that opened it.
 *
 * An edit changes the type in place, by id: every entry keeps it, and so do Lore's filter and its address. The route
 * replaces the whole type, so what this form does not edit - the description, the colour, the order, the Family Tree
 * choice - is sent back exactly as it is stored.
 *
 * Both choose where the type sits: at the top, or inside another type - structure, so it belongs with the name. Moving a
 * type moves everything inside it, and it goes last among its new siblings. The type itself and anything already inside
 * it are not offered, since a type cannot sit inside itself. Nothing is inherited from a parent, and a parent's Family
 * Tree choice says nothing about its children.
 */
function TypeDialog({
  universeId,
  tree,
  type,
  initialParent = null,
  groups,
  types,
  onGroupsChanged,
  onClose,
  onSaved,
}: {
  universeId: string
  tree: TypeTree
  /** The type being edited, or null for a new one. */
  type: EntityType | null
  /** For a new type: the type it starts inside (a row's Add child). Still only a starting choice - the select decides. */
  initialParent?: EntityType | null
  /** Every group of the universe, and every type, for the Groups control. */
  groups: EntityTypeGroup[]
  types: EntityType[]
  onGroupsChanged: () => Promise<void>
  onClose: () => void
  /** With the parent it was saved under, null at the top. */
  onSaved: (name: string, parentId: string | null) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const initial = {
    name: type?.name ?? '',
    icon: type?.icon ?? null,
    familyTreeEligible: type?.familyTreeEligible ?? false,
    parentId: type ? type.parentId : (initialParent?.id ?? null),
    // The groups the type was in when the drawer opened, by id: only a change to these is sent.
    groupIds: type
      ? groups.filter((group) => group.typeIds.includes(type.id)).map((group) => group.id)
      : [],
  }
  const [name, setName] = useState(initial.name)
  const [parentId, setParentId] = useState<string | null>(initial.parentId)
  const ownBranch =
    type && tree.byId.get(type.id) ? branchIds(tree.byId.get(type.id)!) : new Set<string>()
  const parents = tree.ordered.filter((node) => !ownBranch.has(node.type.id))
  const chosenParent = parentId ? (tree.byId.get(parentId)?.type ?? null) : null
  const [icon, setIcon] = useState<string | null>(initial.icon)
  const [familyTreeEligible, setFamilyTreeEligible] = useState(initial.familyTreeEligible)
  const [groupChoices, setGroupChoices] = useState<GroupChoice[]>(() =>
    initial.groupIds.map((id) => ({ id })),
  )
  const groupsChanged =
    payloadKey(
      groupChoices.map((choice) => ('id' in choice ? choice.id : `new:${choice.name}`)),
    ) !== payloadKey(initial.groupIds)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    groupsChanged ||
    payloadKey({ name: name.trim(), icon, familyTreeEligible, parentId }) !==
      payloadKey({
        name: initial.name,
        icon: initial.icon,
        familyTreeEligible: initial.familyTreeEligible,
        parentId: initial.parentId,
      })
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    type
      ? `Your changes to “${type.name}” have not been saved. Leave without saving them?`
      : 'This type has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('type-name')?.focus()
  }, [])

  async function save() {
    setMessage(null)
    setFieldErrors({})
    if (!name.trim()) {
      setFieldErrors({ name: 'Give the type a name.' })
      return
    }

    setIsSaving(true)
    try {
      if (type) {
        await updateEntityType(universeId, type.id, {
          name: name.trim(),
          description: type.description,
          icon,
          accentColor: type.accentColor,
          displayOrder: type.displayOrder,
          familyTreeEligible: type.familyTreeEligible,
          parent: { id: parentId },
          ...(groupsChanged ? { groups: groupChoices } : {}),
        })
      } else {
        await createEntityType(universeId, {
          name: name.trim(),
          description: null,
          icon,
          accentColor: null,
          displayOrder: null,
          familyTreeEligible,
          parent: { id: parentId },
          ...(groupChoices.length > 0 ? { groups: groupChoices } : {}),
        })
      }
      await onSaved(name.trim(), parentId)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : `Some details need a change before this can be ${type ? 'saved' : 'created'}.`,
        )
      } else {
        setMessage(type ? 'That type could not be saved.' : 'That type could not be created.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="type-heading"
      {...dialogProps}
      data-testid={type ? 'edit-type-dialog' : 'new-type-dialog'}
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">Lore Types</p>
          <h2 className="drawer__title" id="type-heading">
            {type ? 'Edit type' : chosenParent ? 'New child type' : 'New type'}
          </h2>
          {/* Where a new type is going, in a line, while it is going inside one. The Parent type select is what decides. */}
          {!type && chosenParent ? (
            <p className="drawer__context" data-testid="type-dialog-context">
              Inside <bdi>{chosenParent.name}</bdi>
            </p>
          ) : null}
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="type-dialog-error">
              {message}
            </p>
          ) : null}

          {/* The form in three parts, as an author thinks of a type: what it is, where it sits, what it does. */}
          <section className="drawer__group" aria-labelledby="type-identity">
            <h3 className="sectionrule sectionrule--accent" id="type-identity">
              Identity
            </h3>
            <Field
              label="Name"
              name="type-name"
              placeholder={type ? undefined : 'Starship, Language, Ritual…'}
              dir="auto"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              data-testid="type-name"
            />

            <div className="field">
              <TypeIconPicker value={icon} onChange={setIcon} testId="type-icon" />
              <p className="field__hint">
                Optional, and only a picture: it marks the type on the Lore filter. Nothing is
                chosen for you from the name.
              </p>
              {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
            </div>
          </section>

          <section className="drawer__group" aria-labelledby="type-hierarchy">
            <h3 className="sectionrule sectionrule--accent" id="type-hierarchy">
              Hierarchy
            </h3>
            <div className="field">
              <label className="field__label" htmlFor="type-parent">
                Parent type
              </label>
              <select
                id="type-parent"
                className="field__input field__input--select"
                value={parentId ?? ''}
                onChange={(event) => setParentId(event.target.value || null)}
                aria-describedby="type-parent-hint"
                data-testid="type-parent"
              >
                <option value="">None – a top-level type</option>
                {parents.map((node) => (
                  <option key={node.type.id} value={node.type.id}>
                    {typePathLabel(node)}
                  </option>
                ))}
              </select>
              <p className="field__hint" id="type-parent-hint">
                Organises Lore: choosing a type there shows the entries of the types inside it too.
                Nothing is inherited - each type keeps its own fields.
              </p>
              {fieldErrors.parent ? <p className="field__error">{fieldErrors.parent}</p> : null}
            </div>
          </section>

          <TypeGroupsField
            universeId={universeId}
            groups={groups}
            types={types}
            value={groupChoices}
            onChange={setGroupChoices}
            onGroupsChanged={onGroupsChanged}
          />
          {fieldErrors.groups ? <p className="field__error">{fieldErrors.groups}</p> : null}

          {type ? null : (
            <section className="drawer__group" aria-labelledby="type-behaviour">
              <h3 className="sectionrule sectionrule--accent" id="type-behaviour">
                Behaviour
              </h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={familyTreeEligible}
                  onChange={(event) => setFamilyTreeEligible(event.target.checked)}
                  data-testid="type-family"
                />
                <span>
                  <span className="types__familylabel">Family Tree</span>
                  Entries of this type can appear in Family Tree
                </span>
              </label>
            </section>
          )}
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-type">
            {type ? (isSaving ? 'Saving…' : 'Save changes') : isSaving ? 'Creating…' : 'Create'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-type"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
