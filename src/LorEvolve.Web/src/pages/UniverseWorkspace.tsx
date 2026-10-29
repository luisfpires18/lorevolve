import { useCallback, useEffect, useId, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AccountMenu } from '../components/AccountMenu'
import { BRAND_LINK_LABEL } from '../components/BrandMark'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { UniverseAssistant } from '../components/UniverseAssistant'
import { UniverseSearch } from '../components/UniverseSearch'
import { getChronology } from '../chronology/api'
import type { Chronology } from '../chronology/types'
import { getUniverse } from '../universes/api'
import { offered, SECTION_GROUPS, UPKEEP } from '../universes/sections'
import { capabilitiesOf, ROLE_LABELS, UniverseAccessContext } from '../universes/access'
import { UniverseRole } from '../universes/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { UniverseDetail } from '../universes/types'
import { artworkUrl } from '../publishing/api'
import type { UniverseArtworkRef } from '../publishing/types'
import { EmptyState } from '../components/EmptyState'

const SECTIONS = SECTION_GROUPS.flat()

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; universe: UniverseDetail; chronology: Chronology }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

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
}

/** The part of the URL below this universe, without its surrounding slashes. */
function pathWithin(pathname: string, id: string | undefined) {
  const base = `/app/universes/${id ?? ''}`
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  return rest.replace(/^\/+|\/+$/g, '')
}

/** Which section the current URL is in. `lore/:entityId` is still Lore. */
function currentSection(pathname: string, id: string | undefined) {
  const segment = pathWithin(pathname, id).split('/')[0] ?? ''
  return SECTIONS.find((section) => section.segment === segment)?.label ?? 'Overview'
}

export default function UniverseWorkspace() {
  const { id } = useParams<{ id: string }>()
  const { pathname } = useLocation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  // Only the narrow layout hides the section list; on a wide screen CSS keeps it open and
  // the toggle is not shown at all, so one piece of state serves both without measuring
  // the viewport in JavaScript.
  //
  // What is stored is the route the list was opened on, not a boolean, so "open" means
  // "opened here". A section that has just been opened is then never read through the list
  // that opened it, and arriving by the browser's own back and forward closes it too -
  // both fall out of the render rather than out of an effect chasing the URL.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null)
  const isNavOpen = navOpenAt === pathname
  const navId = useId()

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!id) return
      Promise.all([getUniverse(id, signal), getChronology(id, signal)])
        .then(([universe, chronology]) => setState({ kind: 'ready', universe, chronology }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          // The API answers 404 both for a missing universe and for someone else's.
          const status = (error as { status?: number }).status
          setState(
            status === 404
              ? { kind: 'missing' }
              : {
                  kind: 'error',
                  message: error instanceof Error ? error.message : 'Could not open this universe.',
                },
          )
        })
    },
    [id],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  const refresh = useCallback(
    (next?: UniverseDetail) => {
      if (next) {
        setState((current) => (current.kind === 'ready' ? { ...current, universe: next } : current))
      } else {
        load()
      }
    },
    [load],
  )

  const setChronology = useCallback((chronology: Chronology) => {
    setState((current) => (current.kind === 'ready' ? { ...current, chronology } : current))
  }, [])

  // Publish hands up a changed artwork; only its two ids are the universe's to hold, and they replace the ones the
  // universe arrived with, so the atmosphere follows without a reload.
  const setArtwork = useCallback((next: UniverseArtworkRef | null) => {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            universe: {
              ...current.universe,
              artwork: next ? { assetId: next.assetId, cardId: next.cardId } : null,
            },
          }
        : current,
    )
  }, [])

  // The tab names the section and then the universe - "Lore | Hollowmere | LorEvolve" - from the shell, which knows both;
  // an entry or a story inside a section is still that section here, and nothing beneath sets a title of its own.
  useDocumentTitle(
    ...(state.kind === 'ready' ? [currentSection(pathname, id), state.universe.name] : []),
  )

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <EmptyState
        testId="universe-missing"
        title="That universe is not here."
        hint={
          <>
            It may have been deleted, or it belongs to someone else.{' '}
            <Link to="/app">Back to your universes</Link>
          </>
        }
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>{state.message}</p>
        <button className="button button--secondary" type="button" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    )
  }

  const { universe, chronology } = state
  const accent = universe.accentColor ?? undefined

  // The world's own artwork as the atmosphere at the head of every screen, from the universe itself, so the first
  // ready render already has it. The API sends it to the owner only (ADR 0041); anyone else, and a world without
  // artwork, gets LorEvolve's.
  const artwork = universe.artwork ? artworkUrl(universe.id, universe.artwork, 'card') : null

  // What this account may do here, for what is drawn: the API decides every request on its own (ADR 0041).
  const access = capabilitiesOf(universe.accessRole)
  const shared = universe.accessRole !== UniverseRole.Owner
  const groups = SECTION_GROUPS.map((group) => offered(group, access, universe.aiHelp)).filter(
    (group) => group.length > 0,
  )
  const section = currentSection(pathname, id)

  return (
    <div
      className="workspace"
      style={accent ? { ['--universe-accent' as string]: accent } : undefined}
    >
      <nav className="rail" aria-label="LorEvolve">
        {/* The drawn L, deliberately, and not the LorEvolve symbol. The symbol was tried here: at
            the ~30px this rail allows it reads as a red tangle rather than a sphere, and it
            puts the only saturated colour in the chrome directly above the universe's accent
            seal - which is the one thing in the rail that carries meaning. The mark is shown
            large on the auth plate and small in the paper bars instead. */}
        {/* LorEvolve's mark leads to LorEvolve's home, from everywhere (031), and its name says so. The universes are "All
            universes", at the head of the sidebar and of the phone's Sections sheet; the account menu at the rail's
            foot names Explore and My workspace. The glyph stays small and its target does not: a 40px square, the
            rail's own width less its margins. */}
        <Link className="rail__mark" to="/" aria-label={BRAND_LINK_LABEL}>
          L
        </Link>
        <span className="rail__seal" aria-hidden="true" />

        {/* Only rendered into the narrow layout, where the sidebar head is folded away:
            the bar has to keep saying which universe and which section this is. The name carries its own
            direction rather than a <bdi>, because it is cut with an ellipsis: only the clipping element's
            direction puts the cut at the end of a name written right to left, not at its start. */}
        <p className="rail__where" data-testid="workspace-where">
          <span className="rail__universe" dir="auto" title={universe.name}>
            {universe.name}
          </span>
          <span className="rail__section">{section}</span>
          {universe.isArchived ? <span className="rail__archived">Archived</span> : null}
        </p>

        <button
          className="rail__toggle"
          type="button"
          aria-expanded={isNavOpen}
          aria-controls={navId}
          onClick={() => setNavOpenAt(isNavOpen ? null : pathname)}
          data-testid="workspace-nav-toggle"
        >
          {isNavOpen ? 'Close' : 'Sections'}
        </button>

        {/* The account lives on the global rail, not in the sidebar: the sidebar is this
            universe's sections, and an account is not one of them.

            Last in the list, and on a wide screen pushed to the foot of the rail rather than
            tucked under the "L". The mark and the accent seal are a pair - LorEvolve, and which world
            this is - and putting a third circle between them would read as a third piece of the
            same statement. At the foot it is where a global rail's account always is, and out of
            the way of the one thing the rail is for.

            On a narrow screen the rail is the sticky bar, this row is horizontal, and the same
            node lands at the right-hand end - so the account is reachable on a phone without a
            second account UI existing anywhere. */}
        <AccountMenu variant="rail" />
      </nav>

      {/* One landmark for the universe: the way up out of it and its sections, read as one list of places. */}
      <nav
        className="sidebar"
        id={navId}
        data-open={isNavOpen ? 'true' : 'false'}
        aria-label="Universe"
      >
        <div className="sidebar__head">
          <Link className="sidebar__back" to="/app">
            <ArrowLeft
              className="sidebar__backicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            All universes
          </Link>
          {/* The world's artwork in miniature beside its name, when its owner has given it one. Decorative. */}
          <div className="sidebar__identity">
            {artwork ? (
              <img className="sidebar__art" src={artwork} alt="" width={44} height={44} />
            ) : null}
            {/* A name, not the screen's heading: each screen's own title is its h1. */}
            <p className="sidebar__name" data-testid="workspace-name">
              <bdi>{universe.name}</bdi>
            </p>
          </div>
          {shared ? (
            <span className="sidebar__role" data-testid="workspace-role">
              Shared · {ROLE_LABELS[universe.accessRole]}
            </span>
          ) : null}
          {universe.isArchived ? <span className="sidebar__archived">Archived</span> : null}
        </div>

        <ul className="sidebar__nav">
          {groups.map((group) => (
            <li
              className={
                UPKEEP.includes(group[0])
                  ? 'sidebar__group sidebar__group--upkeep'
                  : 'sidebar__group'
              }
              key={group[0].segment}
              data-testid={UPKEEP.includes(group[0]) ? 'sidebar-upkeep' : undefined}
            >
              <ul className="sidebar__links">
                {group.map(({ segment, label, testId, icon: Icon }) => (
                  <li key={label}>
                    <NavLink
                      to={segment === '' ? '.' : segment}
                      end={segment === ''}
                      className="sidebar__link"
                      data-testid={testId}
                    >
                      <Icon
                        className="sidebar__icon"
                        aria-hidden="true"
                        focusable="false"
                        strokeWidth={1.75}
                      />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div className="workspace__column">
        {/* The atmosphere: the world's artwork - or LorEvolve's own - behind the head of every screen, fading into the
            working surface. Decorative, out of the flow, never a target; the front page takes it taller. */}
        <div
          className="atmosphere"
          aria-hidden="true"
          data-testid="workspace-atmosphere"
          data-source={artwork ? 'world' : 'lorevolve'}
          data-size={section === 'Overview' ? 'hero' : undefined}
          style={artwork ? { ['--atmosphere-image' as string]: `url("${artwork}")` } : undefined}
        />

        {/* The universe's search, above every screen in it rather than on any one of them. Keyed by the universe, so a
            search typed in one world is never left standing in the next. Search was the sidebar's last greyed section;
            it is not a section, it is how any section's content is reached. The assistant sits beside it for the same
            reason, keyed the same way so one world's conversation never follows the author into the next (ADR 0045). */}
        <div className="workspace__top" key={universe.id}>
          <UniverseSearch universeId={universe.id} />
          {universe.aiHelp ? (
            <UniverseAssistant
              universeId={universe.id}
              universeName={universe.name}
              canPropose={access.suggestChanges}
            />
          ) : null}
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
                } satisfies WorkspaceContext
              }
            />
          </UniverseAccessContext.Provider>
        </main>
      </div>
    </div>
  )
}
