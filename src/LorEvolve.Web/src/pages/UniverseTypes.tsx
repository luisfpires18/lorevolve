import { useUniverseAccess } from '../universes/access'
import { TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import { RelationshipTypeManager } from '../components/RelationshipTypeManager'
import { TypeGroupsPanel } from '../components/TypeGroupsPanel'
import { ValidationTermManager } from '../components/ValidationTermManager'
import { useI18n } from '../i18n'
import { ProjectSchema } from '../components/ProjectSchema'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { TypeTemplates } from '../components/TypeTemplates'
import { useTypesGames } from '../lore/useTypesGames'
import { useTypesState } from '../lore/useTypesState'
import { typeSiblings } from '../lore/typeSiblings'
import { typeActions } from '../lore/typeActions'
import { typeReorder } from '../lore/typeReorder'
import { TypesHeader } from '../components/lore/TypesHeader'
import { TypeEditorDialog } from '../components/lore/TypeEditorDialog'
import { TypesNotices } from '../components/lore/TypesNotices'
import { TypeListDnd } from '../components/lore/TypeListDnd'

/**
 * The universe's vocabularies (Product refinement 016): Lore Types, Relation Kinds, and Event Kinds & Methods, each a tab
 * in the address (`?tab=`) as real steps of history - Back and Forward walk the tabs, unlike Settings. Every panel stays mounted, so a half-written relation kind
 * survives a look at another tab.
 */
export default function UniverseTypes() {
  const { t, tx } = useI18n()
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
      <TypesHeader
        access={access}
        tabs={tabs}
        ledes={ledes}
        tab={tab}
        chooseTab={chooseTab}
        games={games}
        gaming={gaming}
        game={game}
        templates={templates}
        showLore={showLore}
        current={current}
        chooseContext={chooseContext}
        chooseGame={chooseGame}
        setChildOf={setChildOf}
        setEditing={setEditing}
      />

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
        <TypeEditorDialog
          universe={universe}
          tree={tree}
          groups={groups}
          editing={editing}
          setEditing={setEditing}
          childOf={childOf}
          setBlocked={setBlocked}
          setNotice={setNotice}
          refresh={refresh}
        />
      ) : null}

      <TabPanel idPrefix="types" id="lore" tab={showLore ? tab : ''}>
        <TypesNotices
          types={types}
          message={message}
          setMessage={setMessage}
          notice={notice}
          refresh={refresh}
        />

        {!types ? (
          message ? null : (
            <p className="notice" role="status">
              {t('entityTypes.page.reading')}
            </p>
          )
        ) : (
          <TypeListDnd
            tree={tree}
            carried={carried}
            sensors={sensors}
            dragId={dragId}
            setDragId={setDragId}
            setLifted={setLifted}
            target={target}
            setTarget={setTarget}
            siblingsOf={siblingsOf}
            onDragMove={onDragMove}
            reorder={reorder}
            groups={groups}
            access={access}
            openTypeId={openTypeId}
            dropLine={dropLine}
            blocked={blocked}
            universe={universe}
            refresh={refresh}
            moving={moving}
            lifted={lifted}
            setNotice={setNotice}
            moveButtons={moveButtons}
            setOpenTypeId={setOpenTypeId}
            setBlocked={setBlocked}
            setEditing={setEditing}
            onHandleKey={onHandleKey}
            move={move}
            openChild={openChild}
            removeType={removeType}
          />
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
