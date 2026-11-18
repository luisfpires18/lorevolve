import { useUniverseAccess } from '../universes/access'
import { Link } from 'react-router-dom'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { ArrowDown, ArrowUp, GripVertical, Layers, ListTree, Pencil, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import { RelationshipTypeManager } from '../components/RelationshipTypeManager'
import { TypeIcon } from '../components/TypeIcon'
import { TypeDialog } from '../components/TypeDialog'
import { TypeReorderHandle } from '../components/TypeReorderHandle'
import { TypeFields } from '../components/TypeFields'
import { TypeGroupsPanel } from '../components/TypeGroupsPanel'
import { ValidationTermManager } from '../components/ValidationTermManager'
import { useI18n } from '../i18n'
import { createEntityType, updateEntityType } from '../lore/typesApi'
import { branchIds, typePathLabel } from '../lore/typeTree'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/Field'
import { ProjectSchema } from '../components/ProjectSchema'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { TypeTemplates } from '../components/TypeTemplates'
import { useTypesGames } from '../lore/useTypesGames'
import { useTypesState } from '../lore/useTypesState'
import { typeSiblings } from '../lore/typeSiblings'
import { typeActions } from '../lore/typeActions'
import { typeReorder } from '../lore/typeReorder'

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

  const {
    games,
    waitingForGames,
    gaming,
    game,
    templates,
    showLore,
    current,
    chooseContext,
    chooseGame,
  } = useTypesGames({ universe })

  const state = useTypesState({ typesRead, groupsRead, t })
  const {
    types,
    groups,
    setMessage,
    message,
    editing,
    setEditing,
    childOf,
    setChildOf,
    openTypeId,
    setOpenTypeId,
    blocked,
    setBlocked,
    notice,
    setNotice,
    tree,
    moving,
    moveButtons,
    dragId,
    setDragId,
    lifted,
    setLifted,
    target,
    setTarget,
    sensors,
  } = state

  const { siblingsOf, lastOf } = typeSiblings({ tree })
  const { report, refresh, refreshGroups, move, removeType, openChild } = typeActions({
    ...state,
    universe,
    setTypes,
    setGroups,
    refreshTypes,
    siblingsOf,
    t,
    tx,
  })
  const { onDragMove, reorder, onHandleKey } = typeReorder({
    ...state,
    universe,
    setTypes,
    siblingsOf,
    lastOf,
    report,
    refresh,
    t,
  })

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

  return (
    <article className="types">
      <PageHeader
        title={t('entityTypes.page.title')}
        lede={
          templates
            ? t('entityTypes.page.ledes.templates')
            : gaming
              ? t('entityTypes.page.ledes.gaming', { game: game.name })
              : ledes[tab]
        }
        actions={
          showLore && tab === 'lore' && access.editContent ? (
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
        <div className="types__context">
          <div
            className="segmented"
            role="group"
            aria-label={t('entityTypes.page.context.label')}
            data-testid="types-context"
          >
            {(
              ['lore', ...(games.length > 0 ? (['gaming'] as const) : []), 'templates'] as const
            ).map((each) => (
              <button
                key={each}
                className="segmented__option"
                type="button"
                aria-pressed={current === each}
                onClick={() => chooseContext(each)}
                data-testid={`types-context-${each}`}
              >
                {t(`entityTypes.page.context.${each}`)}
              </button>
            ))}
          </div>
          {gaming ? (
            <Field label={t('entityTypes.page.game.label')}>
              {(control) => (
                <select
                  {...control}
                  className="field__input field__input--select"
                  value={game.id}
                  onChange={(event) => chooseGame(event.target.value)}
                  data-testid="types-game"
                >
                  {games.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </div>
        {showLore ? (
          <QueryTabList
            label={t('entityTypes.page.title')}
            idPrefix="types"
            tabs={tabs}
            tab={tab}
            onChoose={chooseTab}
          />
        ) : null}
      </PageHeader>

      {waitingForGames ? (
        <p className="notice" role="status">
          {t('entityTypes.page.game.loading')}
        </p>
      ) : null}
      {gaming ? (
        <ProjectSchema
          key={game.id}
          projectId={game.id}
          reloadKey={0}
          universeId={universe.id}
          canEdit={access.editContent}
        />
      ) : null}
      {templates ? <TypeTemplates universeId={universe.id} canEdit={access.editContent} /> : null}

      {editing ? (
        <TypeDialog
          tree={tree}
          type={editing === 'new' ? null : editing}
          initialParent={editing === 'new' ? childOf : null}
          groups={groups}
          write={(values) =>
            editing === 'new'
              ? createEntityType(universe.id, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  displayOrder: null,
                  familyTreeEligible: values.familyTreeEligible,
                  parent: { id: values.parentId },
                  ...(values.groups ? { groups: values.groups } : {}),
                })
              : // What this drawer does not edit - the description, the colour, the order, the Family Tree choice - goes
                // back exactly as it is stored.
                updateEntityType(universe.id, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  displayOrder: editing.displayOrder,
                  familyTreeEligible: editing.familyTreeEligible,
                  parent: { id: values.parentId },
                  ...(values.groups ? { groups: values.groups } : {}),
                })
          }
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

      <TabPanel idPrefix="types" id="lore" tab={showLore ? tab : ''}>
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

      <TabPanel idPrefix="types" id="groups" tab={showLore ? tab : ''}>
        <TypeGroupsPanel
          universeId={universe.id}
          groups={groups}
          types={types ?? []}
          canEdit={access.editContent}
          onGroupsChanged={refreshGroups}
        />
      </TabPanel>

      <TabPanel idPrefix="types" id="relations" tab={showLore ? tab : ''}>
        <RelationshipTypeManager universeId={universe.id} />
      </TabPanel>

      <TabPanel idPrefix="types" id="events" tab={showLore ? tab : ''}>
        <ValidationTermManager universeId={universe.id} />
      </TabPanel>
    </article>
  )
}
