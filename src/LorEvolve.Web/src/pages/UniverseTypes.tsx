import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, Layers, ListTree, Pencil, Plus } from 'lucide-react'
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
import { TypeGroupsPanel } from '../components/TypeGroupsPanel'
import { ValidationTermManager } from '../components/ValidationTermManager'
import { t as translate, tn as translateN, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import {
  createEntityType,
  deleteEntityType,
  listEntityTypeGroups,
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
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { confirmAction } from '../lib/confirm'

/** Groups not read: none to offer, one stable list. */
const NO_GROUPS: EntityTypeGroup[] = []

/**
 * The universe's vocabularies (Product refinement 016): Lore Types, Relation Kinds, and Event Kinds & Methods, each a tab
 * in the address (`?tab=`) as real steps of history - Back and Forward walk the tabs, unlike Settings. Every panel stays mounted, so a half-written relation kind
 * survives a look at another tab.
 */
export default function UniverseTypes() {
  const { t, tn, tx } = useI18n()
  const access = useUniverseAccess()
  // The types and groups are the workspace's, read with the universe, so what is changed here is what Lore shows next.
  const {
    universe,
    types: typesRead,
    groups: groupsRead,
    setTypes,
    setGroups,
    refreshTypes,
  } = useWorkspaceTypes()
  // Three vocabularies, one screen: kept apart as tabs so none of them is a long scroll below another.
  const tabs = [
    { id: 'lore' as const, label: t('entityTypes.page.tabs.lore') },
    { id: 'groups' as const, label: t('entityTypes.page.tabs.groups') },
    { id: 'relations' as const, label: t('entityTypes.page.tabs.relations') },
    { id: 'events' as const, label: t('entityTypes.page.tabs.events') },
  ]
  const ledes = {
    lore: t('entityTypes.page.ledes.lore'),
    groups: t('entityTypes.page.ledes.groups'),
    relations: t('entityTypes.page.ledes.relations'),
    events: t('entityTypes.page.ledes.events'),
  }
  const [tab, chooseTab] = useQueryTab(tabs, { history: 'push' })

  const types = Array.isArray(typesRead) ? typesRead : null
  // Groups are an extra: without them the types still work, and the group controls simply have none to offer.
  const groups = Array.isArray(groupsRead) ? groupsRead : NO_GROUPS
  const [reported, setMessage] = useState<string | null>(null)
  const message = reported ?? (typesRead === 'failed' ? t('entityTypes.page.loadFailed') : null)
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
      setNotice(
        t('entityTypes.page.movedToPlace', {
          name: type.name,
          place: to + 1,
          total: siblings.length,
        }),
      )
    } catch (error: unknown) {
      setTypes(previous)
      refocus.current = `${type.id}:handle`
      report(error, t('entityTypes.page.moveFailed'))
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
    const total = siblings.length

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (moving) return
      if (!isLifted) {
        setLifted(type.id)
        setTarget(from)
        setNotice(t('entityTypes.page.lifted', { name: type.name, place: from + 1, total }))
      } else {
        const to = target ?? from
        setLifted(null)
        setTarget(null)
        if (to === from)
          setNotice(t('entityTypes.page.stays', { name: type.name, place: from + 1, total }))
        else void reorder(type, to)
      }
    } else if (isLifted && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const to = Math.min(
        siblings.length - 1,
        Math.max(0, (target ?? from) + (event.key === 'ArrowUp' ? -1 : 1)),
      )
      setTarget(to)
      setNotice(t('entityTypes.page.carriedAt', { name: type.name, place: to + 1, total }))
    } else if (isLifted && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setLifted(null)
      setTarget(null)
      setNotice(t('entityTypes.page.putBack', { name: type.name, place: from + 1, total }))
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

  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  function refresh() {
    return refreshTypes()
  }

  async function refreshGroups() {
    setGroups(await listEntityTypeGroups(universe.id))
  }

  /** One place up or down among the type's own siblings; the list comes back from the move itself. */
  async function move(type: EntityType, direction: 'up' | 'down') {
    if (moving || !types) return
    // Shown at once by swapping places with the neighbour; the server's list replaces it, or the snapshot comes back.
    const previous = types
    const node = tree.byId.get(type.id)
    const siblings = node ? siblingsOf(node) : []
    const neighbour = siblings[siblings.indexOf(node!) + (direction === 'up' ? -1 : 1)]?.type
    if (neighbour) {
      setTypes(
        previous.map((each) =>
          each.id === type.id
            ? { ...each, displayOrder: neighbour.displayOrder }
            : each.id === neighbour.id
              ? { ...each, displayOrder: type.displayOrder }
              : each,
        ),
      )
    }
    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const moved = await moveEntityType(universe.id, type.id, direction)
      refocus.current = `${type.id}:${direction}`
      setTypes(moved)
      setNotice(
        direction === 'up'
          ? t('entityTypes.page.movedUp', { name: type.name })
          : t('entityTypes.page.movedDown', { name: type.name }),
      )
    } catch (error: unknown) {
      setTypes(previous)
      report(error, t('entityTypes.page.moveFailed'))
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
        title: <>{tx('entityTypes.page.deleteTitle', { name: <bdi>{type.name}</bdi> })}</>,
        message: t('entityTypes.page.deleteMessage'),
        confirmLabel: t('entityTypes.page.deleteConfirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }

    try {
      await deleteEntityType(universe.id, type.id)
      setNotice(t('entityTypes.page.deleted', { name: type.name }))
      if (openTypeId === type.id) setOpenTypeId(null)
      await refresh()
    } catch (error: unknown) {
      // Used since the list was read - another tab, or the entry form - so the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ typeId: type.id, text: error.message })
        await refresh().catch(() => undefined)
      } else {
        report(error, t('entityTypes.page.deleteFailed'))
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
        title={t('entityTypes.page.title')}
        lede={ledes[tab]}
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
              {t('entityTypes.page.newType')}
            </button>
          ) : null
        }
      >
        <QueryTabList
          label={t('entityTypes.page.title')}
          idPrefix="types"
          tabs={tabs}
          tab={tab}
          onChoose={chooseTab}
        />
      </PageHeader>

      {editing ? (
        <TypeDialog
          universeId={universe.id}
          tree={tree}
          type={editing === 'new' ? null : editing}
          initialParent={editing === 'new' ? childOf : null}
          groups={groups}
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
                ? t('entityTypes.page.createdInside', { name: savedName, parent })
                : wasNew
                  ? t('entityTypes.page.created', { name: savedName })
                  : t('entityTypes.page.saved', { name: savedName }),
            )
            await refresh()
          }}
        />
      ) : null}

      <TabPanel idPrefix="types" id="lore" tab={tab}>
        {message ? (
          <div className="notice notice--error" role="alert" data-testid="types-error">
            <p>{message}</p>
            {!types ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setMessage(null)
                  refresh().catch(() => undefined)
                }}
              >
                {t('entityTypes.page.retry')}
              </button>
            ) : null}
          </div>
        ) : null}

        <p className="types__notice" role="status" data-testid="types-notice">
          {notice}
        </p>

        {!types ? (
          message ? null : (
            <p className="notice" role="status">
              {t('entityTypes.page.reading')}
            </p>
          )
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
                draggable: t('entityTypes.page.dnd.instructions'),
              },
              announcements: {
                onDragStart: ({ active }) =>
                  t('entityTypes.page.dnd.pickedUp', {
                    name:
                      tree.byId.get(String(active.id))?.type.name ??
                      t('entityTypes.page.dnd.aType'),
                  }),
                onDragOver: () => undefined,
                onDragEnd: ({ active }) =>
                  t('entityTypes.page.dnd.dropped', {
                    name:
                      tree.byId.get(String(active.id))?.type.name ??
                      t('entityTypes.page.dnd.theType'),
                  }),
                onDragCancel: ({ active }) =>
                  t('entityTypes.page.dnd.putBack', {
                    name:
                      tree.byId.get(String(active.id))?.type.name ??
                      t('entityTypes.page.dnd.theType'),
                  }),
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
                              path: typePathLabel(
                                tree.byId.get(node.path[node.path.length - 2]!.id)!,
                              ),
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
                                <span className="visually-hidden">
                                  {' '}
                                  {t('entityTypes.page.groupSuffix')}
                                </span>
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
                      <span className="types__actions">
                        {access.editContent ? (
                          <>
                            <span
                              className="types__move"
                              role="group"
                              aria-label={t('entityTypes.page.orderOf', { name: type.name })}
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
                                    aria-label={
                                      direction === 'up'
                                        ? t('entityTypes.page.moveUpLabel', { name: type.name })
                                        : t('entityTypes.page.moveDownLabel', { name: type.name })
                                    }
                                    title={
                                      isEnd
                                        ? direction === 'up'
                                          ? t('entityTypes.page.alreadyFirst')
                                          : t('entityTypes.page.alreadyLast')
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!isEnd) void move(type, direction)
                                    }}
                                    data-testid={`move-${direction}-${type.name}`}
                                  >
                                    <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                                    {direction === 'up'
                                      ? t('entityTypes.page.up')
                                      : t('entityTypes.page.down')}
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
                              aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
                              data-testid={`add-child-${type.name}`}
                            >
                              <ActionIcon icon={ListTree} />
                              {t('entityTypes.page.addChild')}
                            </button>
                            <button
                              className="button button--secondary button--sm"
                              type="button"
                              onClick={() => {
                                setBlocked(null)
                                setEditing(type)
                              }}
                              aria-label={t('entityTypes.page.editLabel', { name: type.name })}
                              data-testid={`edit-type-${type.name}`}
                            >
                              <ActionIcon icon={Pencil} />
                              {t('entityTypes.page.edit')}
                            </button>
                          </>
                        ) : null}
                        <button
                          className="button button--secondary button--sm"
                          type="button"
                          aria-expanded={openTypeId === type.id}
                          aria-label={t('entityTypes.page.fieldsLabel', { name: type.name })}
                          onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                          data-testid={`fields-${type.name}`}
                        >
                          {t('entityTypes.page.fields')}
                          {type.fields.length > 0 ? (
                            <span className="types__fieldcount">{type.fields.length}</span>
                          ) : null}
                        </button>
                        {access.editContent ? (
                          <ActionMenu
                            label={t('entityTypes.page.moreActions', { name: type.name })}
                            triggerTestId={`type-actions-${type.name}`}
                          >
                            <button
                              className="actionmenu__item types__addchilditem"
                              type="button"
                              onClick={() => openChild(type)}
                              aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
                              data-testid={`add-child-item-${type.name}`}
                            >
                              <ActionIcon icon={ListTree} />
                              {t('entityTypes.page.addChildType')}
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
                                  {direction === 'up'
                                    ? t('entityTypes.page.moveUp')
                                    : t('entityTypes.page.moveDown')}
                                </button>
                              ),
                            )}
                            <button
                              className="actionmenu__item actionmenu__item--danger"
                              type="button"
                              onClick={() => void removeType(type)}
                              data-testid={`delete-type-${type.name}`}
                            >
                              {t('entityTypes.page.deleteType')}
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
                      {tn('entityTypes.page.nested', branchIds(carried).size - 1, {
                        n: branchIds(carried).size - 1,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </TabPanel>

      <TabPanel idPrefix="types" id="groups" tab={tab}>
        <TypeGroupsPanel
          universeId={universe.id}
          groups={groups}
          types={types ?? []}
          canEdit={access.editContent}
          onGroupsChanged={refreshGroups}
        />
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
  const vars = { name, field: first.field, owner: first.owner, n: others }
  if (others === 0) {
    return translate(
      first.archived ? 'entityTypes.page.targetedNoneArchived' : 'entityTypes.page.targetedNone',
      vars,
    )
  }
  return translateN(
    first.archived ? 'entityTypes.page.targetedOthersArchived' : 'entityTypes.page.targetedOthers',
    others,
    vars,
  )
}

/**
 * Why a type cannot be deleted, in the author's terms. The same sentence the API's refusal carries
 * (`EntityTypeEndpoints.InUseDetail`), said from the list before anything is sent: an entry in the Trash is out of sight in
 * Lore and still keeps its type, so it is named.
 */
function inUseDetail(name: string, live: number, trashed: number, children = 0) {
  if (live + trashed === 0) {
    return translateN('entityTypes.page.inUse.onlyNested', children, { name, n: children })
  }
  const total = live + trashed
  const nested = translateN('entityTypes.page.inUse.nested', children, { n: children })
  const vars = { name, n: total, trashed, nested }
  const reason =
    children === 0
      ? trashed === 0
        ? translateN('entityTypes.page.inUse.reasonNone', total, vars)
        : trashed === total
          ? translateN('entityTypes.page.inUse.reasonAll', total, vars)
          : translateN('entityTypes.page.inUse.reasonSome', total, vars)
      : trashed === 0
        ? translateN('entityTypes.page.inUse.reasonNestedNone', total, vars)
        : trashed === total
          ? translateN('entityTypes.page.inUse.reasonNestedAll', total, vars)
          : translateN('entityTypes.page.inUse.reasonNestedSome', total, vars)
  const fix = translate(
    total === 1
      ? trashed === 0
        ? 'entityTypes.page.inUse.fixOne'
        : 'entityTypes.page.inUse.fixOneTrashed'
      : trashed === 0
        ? 'entityTypes.page.inUse.fixMany'
        : 'entityTypes.page.inUse.fixManyTrashed',
  )
  return children === 0
    ? `${reason} ${fix}`
    : `${reason} ${fix} ${translateN('entityTypes.page.inUse.tail', children)}`
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
 * it are not offered, since a type cannot sit inside itself. A nested type inherits every field of the types above it, and a parent's Family
 * Tree choice says nothing about its children.
 */
function TypeDialog({
  universeId,
  tree,
  type,
  initialParent = null,
  groups,
  onClose,
  onSaved,
}: {
  universeId: string
  tree: TypeTree
  /** The type being edited, or null for a new one. */
  type: EntityType | null
  /** For a new type: the type it starts inside (a row's Add child). Still only a starting choice - the select decides. */
  initialParent?: EntityType | null
  /** Every group of the universe, for the Groups control. */
  groups: EntityTypeGroup[]
  onClose: () => void
  /** With the parent it was saved under, null at the top. */
  onSaved: (name: string, parentId: string | null) => Promise<void>
}) {
  const { t, tx } = useI18n()
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
      ? t('entityTypes.page.dialog.leaveEdit', { name: type.name })
      : t('entityTypes.page.dialog.leaveNew'),
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
      setFieldErrors({ name: t('entityTypes.page.dialog.nameRequired') })
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
            : type
              ? t('entityTypes.page.dialog.detailsSave')
              : t('entityTypes.page.dialog.detailsCreate'),
        )
      } else {
        setMessage(
          type
            ? t('entityTypes.page.dialog.saveFailed')
            : t('entityTypes.page.dialog.createFailed'),
        )
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
          <p className="drawer__eyebrow">{t('entityTypes.page.dialog.eyebrow')}</p>
          <h2 className="drawer__title" id="type-heading">
            {type
              ? t('entityTypes.page.dialog.editTitle')
              : chosenParent
                ? t('entityTypes.page.dialog.newChildTitle')
                : t('entityTypes.page.dialog.newTitle')}
          </h2>
          {/* Where a new type is going, in a line, while it is going inside one. The Parent type select is what decides. */}
          {!type && chosenParent ? (
            <p className="drawer__context" data-testid="type-dialog-context">
              {tx('entityTypes.page.dialog.inside', { name: <bdi>{chosenParent.name}</bdi> })}
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
              {t('entityTypes.page.dialog.identity')}
            </h3>
            <Field
              label={t('entityTypes.page.dialog.name')}
              name="type-name"
              placeholder={type ? undefined : t('entityTypes.page.dialog.namePlaceholder')}
              dir="auto"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              data-testid="type-name"
            />

            <div className="field">
              <TypeIconPicker value={icon} onChange={setIcon} testId="type-icon" />
              <p className="field__hint">{t('entityTypes.page.dialog.iconHint')}</p>
              {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
            </div>
          </section>

          <section className="drawer__group" aria-labelledby="type-hierarchy">
            <h3 className="sectionrule sectionrule--accent" id="type-hierarchy">
              {t('entityTypes.page.dialog.hierarchy')}
            </h3>
            <div className="field">
              <label className="field__label" htmlFor="type-parent">
                {t('entityTypes.page.dialog.parent')}
              </label>
              <select
                id="type-parent"
                className="field__input field__input--select"
                value={parentId ?? ''}
                onChange={(event) => setParentId(event.target.value || null)}
                aria-describedby="type-parent-hint"
                data-testid="type-parent"
              >
                <option value="">{t('entityTypes.page.dialog.parentNone')}</option>
                {parents.map((node) => (
                  <option key={node.type.id} value={node.type.id}>
                    {typePathLabel(node)}
                  </option>
                ))}
              </select>
              <p className="field__hint" id="type-parent-hint">
                {t('entityTypes.page.dialog.parentHint')}
              </p>
              {fieldErrors.parent ? <p className="field__error">{fieldErrors.parent}</p> : null}
            </div>
          </section>

          <TypeGroupsField groups={groups} value={groupChoices} onChange={setGroupChoices} />
          {fieldErrors.groups ? <p className="field__error">{fieldErrors.groups}</p> : null}

          {type ? null : (
            <section className="drawer__group" aria-labelledby="type-behaviour">
              <h3 className="sectionrule sectionrule--accent" id="type-behaviour">
                {t('entityTypes.page.dialog.behaviour')}
              </h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={familyTreeEligible}
                  onChange={(event) => setFamilyTreeEligible(event.target.checked)}
                  data-testid="type-family"
                />
                <span>
                  <span className="types__familylabel">
                    {t('entityTypes.page.dialog.familyLabel')}
                  </span>
                  {t('entityTypes.page.dialog.familyText')}
                </span>
              </label>
            </section>
          )}
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-type">
            {type
              ? isSaving
                ? t('entityTypes.page.dialog.saving')
                : t('entityTypes.page.dialog.saveChanges')
              : isSaving
                ? t('entityTypes.page.dialog.creating')
                : t('entityTypes.page.dialog.create')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-type"
          >
            {t('entityTypes.page.dialog.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
