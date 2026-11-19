import { Outlet, useLocation, useParams } from 'react-router-dom'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { SiteFooter } from '../components/SiteFooter'
import { UniverseSearch } from '../components/UniverseSearch'
import type { Chronology } from '../chronology/types'
import type { EntityType, EntityTypeGroup } from '../lore/typeDefinitions'
import { offered, SECTION_GROUPS, sectionLabel, type ProjectFamily } from '../universes/sections'
import { capabilitiesOf, UniverseAccessContext } from '../universes/access'
import { UniverseRole } from '../universes/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import type { UniverseDetail } from '../universes/types'
import { artworkUrl } from '../publishing/api'
import type { UniverseArtworkRef } from '../publishing/types'
import { WorkspaceLoadError } from '../components/universes/WorkspaceLoadError'
import { WorkspaceMissing } from '../components/universes/WorkspaceMissing'
import { WorkspaceRail } from '../components/universes/WorkspaceRail'
import { WorkspaceSidebar } from '../components/universes/WorkspaceSidebar'
import { useWorkspaceNav } from '../universes/useWorkspaceNav'
import { useWorkspaceReads } from '../universes/useWorkspaceReads'
import { useWorkspaceSetters } from '../universes/useWorkspaceSetters'
import { useWorkspaceState } from '../universes/useWorkspaceState'
import { currentSection } from '../universes/workspaceSections'
import { LoadingNote } from '../components/LoadingNote'

export interface WorkspaceContext {
  universe: UniverseDetail
  refresh: (next?: UniverseDetail) => void

  /**
   * How this universe writes and orders its years. Held here, beside the universe, so the
   * timeline, an entry's birth year and its history all format dates from the same copy, and a
   * change saved in Settings reaches every one of them without a reload.
   */
  chronology: Chronology
  setChronology: (next: Chronology) => void

  /** Hands the shell a changed artwork (Publish), so the world's atmosphere follows it without a reload. */
  setArtwork: (next: UniverseArtworkRef | null) => void

  /**
   * The universe's types and groups, read beside the universe itself rather than after a screen has mounted, so Lore,
   * an entry, the Family Tree, Mass create and Types open on them. Null while the first read is out; 'failed' when it was
   * refused and nothing was read before. Read through `useWorkspaceTypes`, which also reads them again.
   */
  types: EntityType[] | 'failed' | null
  groups: EntityTypeGroup[] | 'failed' | null
  setTypes: (next: EntityType[]) => void
  setGroups: (next: EntityTypeGroup[]) => void
  /** Reads both again. Rejects when the read fails; what was read before stays meanwhile and after a failure. */
  refreshTypes: () => Promise<void>
  revalidateTypes: () => void
  /** Reads the universe's projects again, so the sidebar's project-bound sections follow a create, trash or restore (#272). */
  refreshProjects: () => Promise<void>
  /** The families of project this universe has: the set the sidebar reads, so the Overview offers the same sections (#272, #273). */
  families: ReadonlySet<ProjectFamily>
}

/** One workspace per universe: another universe's address starts a new one, so nothing read for the last carries over. */
export default function UniverseWorkspace() {
  const { id } = useParams<{ id: string }>()
  return <Workspace key={id} />
}

function Workspace() {
  // The whole of the workspace chrome is drawn here - the rail, the sidebar and the tab's title - and every section's
  // name comes from the dictionary through `sectionLabel`. Subscribing once here is what redraws all of them when the
  // language changes; the exported component above is only the key that restarts this one per universe.
  useI18n()
  const { id } = useParams<{ id: string }>()
  const { pathname } = useLocation()
  const workspace = useWorkspaceState()
  const { state, types, typeGroups, families } = workspace
  const { setNavOpenAt, isNavOpen, navId, navRef, toggleRef } = useWorkspaceNav({ pathname })
  const { load, refreshTypes, refreshProjects, revalidateTypes } = useWorkspaceReads({
    ...workspace,
    id,
  })
  const { setTypeList, setGroupList, refresh, setChronology, setArtwork } = useWorkspaceSetters({
    ...workspace,
    load,
  })

  // The tab names the section and then the universe - "Lore | Hollowmere | LorEvolve" - from the shell, which knows both;
  // an entry or a story inside a section is still that section here, and nothing beneath sets a title of its own.
  useDocumentTitle(
    ...(state.kind === 'ready'
      ? [sectionLabel(currentSection(pathname, id)), state.value.universe.name]
      : []),
  )

  if (state.kind === 'loading') {
    return <LoadingNote>{t('workspace.rail.opening')}</LoadingNote>
  }

  if (state.kind === 'missing') {
    return <WorkspaceMissing />
  }

  if (state.kind === 'error') {
    return <WorkspaceLoadError state={state} refresh={refresh} refreshTypes={refreshTypes} />
  }

  const { universe, chronology } = state.value
  const accent = universe.accentColor ?? undefined

  // The world's own artwork as the atmosphere at the head of every screen, from the universe itself, so the first
  // ready render already has it. The API sends it to the owner only (ADR 0041); anyone else, and a world without
  // artwork, gets no atmosphere at all: LorEvolve shows no stock pictures (ADR 0068).
  const artwork = universe.artwork ? artworkUrl(universe.id, universe.artwork, 'card') : null

  // What this account may do here, for what is drawn: the API decides every request on its own (ADR 0041).
  const access = capabilitiesOf(universe.accessRole)
  const shared = universe.accessRole !== UniverseRole.Owner
  // A group with nothing offered is not drawn, Creation included: it has a destination only per kind of project (#272).
  const groups = SECTION_GROUPS.map((source) => ({
    source,
    items: offered(source, access, universe.aiHelp, families),
  })).filter(({ items }) => items.length > 0)
  const section = currentSection(pathname, id)

  return (
    <div
      className="workspace"
      style={accent ? { ['--universe-accent' as string]: accent } : undefined}
    >
      <WorkspaceRail
        universe={universe}
        section={section}
        pathname={pathname}
        isNavOpen={isNavOpen}
        setNavOpenAt={setNavOpenAt}
        navId={navId}
        toggleRef={toggleRef}
      />

      {/* One landmark for the universe: the way up out of it and its sections, read as one list of places. */}
      <WorkspaceSidebar
        universe={universe}
        artwork={artwork}
        shared={shared}
        groups={groups}
        section={section}
        isNavOpen={isNavOpen}
        setNavOpenAt={setNavOpenAt}
        navId={navId}
        navRef={navRef}
      />

      {isNavOpen ? (
        <div
          className="sidebar__scrim"
          aria-hidden="true"
          onClick={() => setNavOpenAt(null)}
          data-testid="workspace-nav-scrim"
        />
      ) : null}

      <div className="workspace__column" inert={isNavOpen}>
        {/* The atmosphere: the world's own artwork behind the head of every screen, fading into the working surface.
            Decorative, out of the flow, never a target; the front page takes it taller. Nothing is drawn for a world
            without a picture (ADR 0068). */}
        {artwork ? (
          <div
            className="atmosphere"
            aria-hidden="true"
            data-testid="workspace-atmosphere"
            data-source="world"
            data-size={section.segment === '' ? 'hero' : undefined}
            style={{ ['--atmosphere-image' as string]: `url("${artwork}")` }}
          />
        ) : null}

        {/* The universe's search, above every screen in it rather than on any one of them. Keyed by the universe, so a
            search typed in one world is never left standing in the next. Search was the sidebar's last greyed section;
            it is not a section, it is how any section's content is reached. The web assistant stood beside it until M4
            (issue #157) retired it; AI reaches a universe over MCP now (ADR 0046). */}
        <div className="workspace__top" key={universe.id}>
          <UniverseSearch universeId={universe.id} />
        </div>

        <main className="canvas" id={MAIN_CONTENT_ID} tabIndex={-1}>
          <UniverseAccessContext.Provider value={access}>
            <Outlet
              context={
                {
                  universe,
                  refresh,
                  chronology,
                  setChronology,
                  setArtwork,
                  types,
                  groups: typeGroups,
                  setTypes: setTypeList,
                  setGroups: setGroupList,
                  refreshTypes,
                  revalidateTypes,
                  refreshProjects,
                  families,
                } satisfies WorkspaceContext
              }
            />
          </UniverseAccessContext.Provider>
        </main>
        <SiteFooter />
      </div>
    </div>
  )
}
