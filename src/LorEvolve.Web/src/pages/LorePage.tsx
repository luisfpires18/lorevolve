import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
  type To,
} from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ListChecks,
  ListFilter,
  ListPlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EmptyState } from '../components/EmptyState'
import { EntityCard } from '../components/EntityCard'
import { LoreCatalog, LoreCatalogSkeleton } from '../components/LoreCatalog'
import { LoreFieldFilters } from '../components/LoreFieldFilters'
import { PageHeader } from '../components/PageHeader'
import { GroupSwitcher, TypeSwitcher } from '../components/TypeSwitcher'
import { ApiError } from '../lib/api'
import {
  LORE_PAGE_SIZES,
  bulkTrashEntities,
  listEntities,
  listEntityTypeGroups,
  listEntityTypes,
  readLorePageSize,
  saveLorePageSize,
} from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  type CanonStatusValue,
  type EntityPage,
  type EntityType,
  type EntityTypeGroup,
} from '../lore/types'
import {
  FIELD_FILTER_PARAM,
  encodeFieldFilter,
  filterableFields,
  isValidFor,
  readFieldFilters,
  withFieldFilters,
  type FieldFilter,
} from '../lore/fieldFilters'
import { buildTypeTree } from '../lore/typeTree'
import type { MassCreatedState } from './MassCreatePage'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'
import { confirmAction } from '../lib/confirm'

type LoadState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error' }

/** How many card shapes stand in for the first page while it is read. */
const SKELETON_CARDS = 6

function readStatus(value: string | null): CanonStatusValue | null {
  return value === '0' || value === '1' || value === '2'
    ? (Number(value) as CanonStatusValue)
    : null
}

function readPage(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The Lore browser. Where the author is - which type, which status, what is typed in the filter, which of the type's own
 * fields narrow it, which page - is the address and nothing else:
 * `lore?type=<id>&status=<0|1|2>&q=<text>&field=<id>:<op>:<value>&page=<n>` (`field` once per filter, 034).
 *
 * Choosing a type or a page is a move, so it is a history entry Back returns through; typing and
 * the status replace the entry they are on, so a word typed is not twenty steps of Back. Adding or removing a field filter
 * is a move too. Field filters belong to the type whose fields they read: another type starts with none.
 *
 * A type is where browsing starts (ADR 0007 amendment, 2026-10-01). There is no "All": with no type chosen the page lists
 * no entries and reads none - a search or status in the address waits for a type. Lore's front page is the catalog
 * instead (Issue #60, ADR 0065): every type as a card, with a "Browse by group" choice above that narrows the cards
 * (`?browse=<group id>`, replacing its history entry, so Back from a type finds the cards as they were). A card opens the
 * same `?type=<id>` the type row links to; the row (a menu on a phone) is the navigation once a type or group is chosen,
 * and the Lore crumb leads back to the cards. A chosen type shows its whole branch: its own entries and those of every
 * type nested beneath it, each card still naming its own type. A type id the universe does not have - deleted,
 * mistyped, or another world's - is taken out of the address, which leaves nothing chosen; it never widens to every
 * entry.
 *
 * A semantic group (Issue #36) is the other way in: `?group=<id>` lists the entries of every type in the group, as it is
 * now. A type and a group are never both chosen - choosing one drops the other - and field filters stay a type's, since a
 * field belongs to one type. An unknown group is taken out of the address like an unknown type.
 *
 * Two kinds of control, kept apart (Issue #49). The type and group navigation is the scope - which entries are browsed - and
 * keeps search and status when it changes. Search, status and field filters narrow that scope, in one row with one Clear
 * filters. Under a group the row says field filters need one type and links its member types that have fields; a `field`
 * left in a group's address is taken out, never silently ignored. Under a type that holds others, a field filter says it
 * matches that type's own entries only.
 */
export default function LorePage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const [params, setParams] = useSearchParams()
  const filtersId = useId()
  const location = useLocation()
  const navigate = useNavigate()

  // "Created 40 entries." after a mass create: said where the author landed and gone once they move on, then taken out of
  // the history entry, so a reload or a return through Back does not say it again.
  const [arrival] = useState(() => ({
    count: (location.state as Partial<MassCreatedState> | null)?.massCreated ?? null,
    search: location.search,
  }))
  const massCreated = arrival.search === location.search ? arrival.count : null
  useEffect(() => {
    if ((location.state as Partial<MassCreatedState> | null)?.massCreated === undefined) return
    void navigate({ search: location.search }, { replace: true, state: null })
  }, [location.state, location.search, navigate])

  const typeParam = params.get('type')
  const groupParam = params.get('group')
  const browseParam = params.get('browse')
  const canonStatus = readStatus(params.get('status'))
  const search = params.get('q') ?? ''
  const page = readPage(params.get('page'))
  const addressFilters = readFieldFilters(params)

  // Selecting, to move entries to the Trash together. A mode the author turns on, so ordinary browsing carries no
  // checkboxes. What is selected belongs to the page on screen: another page, filter, type or size is another list, so
  // the selection is not carried into it - nothing is ever selected out of sight.
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<{ scope: string; ids: ReadonlySet<string> }>({
    scope: '',
    ids: new Set(),
  })
  const [isTrashing, setIsTrashing] = useState(false)
  const trashing = useRef(false)
  const [trashed, setTrashed] = useState<{ text: string; list: string } | null>(null)

  const [types, setTypes] = useState<EntityType[] | null>(null)
  // A failed read of the types is not a universe without any: `types` stays unknown, so nothing below reads the failure as
  // "no types" or takes a chosen type out of the address as one that does not exist (#58).
  const [typesFailed, setTypesFailed] = useState(false)
  const [typeReads, setTypeReads] = useState(0)
  const [groups, setGroups] = useState<EntityTypeGroup[] | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Entries per page: the author's own preference in this browser, never in the address - a link someone shares opens at
  // their reader's size, not the sender's.
  const [pageSize, setPageSize] = useState(readLorePageSize)

  useEffect(() => {
    const controller = new AbortController()
    listEntityTypes(universe.id, controller.signal)
      .then((read) => {
        setTypesFailed(false)
        setTypes(read)
      })
      .catch(() => {
        // Without its types Lore has nothing to choose from; the page says the read failed and offers it again.
        if (!controller.signal.aborted) setTypesFailed(true)
      })
    // Groups are a second way in, not a requirement: if they cannot be read, Lore is browsed by type alone.
    listEntityTypeGroups(universe.id, controller.signal)
      .then(setGroups)
      .catch(() => {
        if (!controller.signal.aborted) setGroups([])
      })
    return () => {
      controller.abort()
    }
  }, [universe.id, typeReads])

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  const selectedNode = (typeParam && tree.byId.get(typeParam)) || null
  const selectedType = selectedNode?.type ?? null
  const isUnknownType = typeParam !== null && types !== null && selectedType === null
  // A type in the address wins over a group, so the two are never read together.
  const selectedGroup =
    (!typeParam && groupParam && groups?.find((group) => group.id === groupParam)) || null
  const isUnknownGroup =
    !typeParam && groupParam !== null && groups !== null && selectedGroup === null
  const chosenName = selectedType?.name ?? selectedGroup?.name ?? null
  // Nothing named in the address: Lore's front page, the catalog of types (Issue #60).
  const atCatalog = !typeParam && !groupParam
  const browsing =
    (atCatalog && browseParam && groups?.find((group) => group.id === browseParam)) || null
  const isUnknownBrowse = atCatalog && browseParam !== null && groups !== null && browsing === null

  // A type this universe does not have is taken out of the address in place, which leaves nothing chosen.
  useEffect(() => {
    if (!isUnknownType) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('type')
        next.delete('page')
        next.delete(FIELD_FILTER_PARAM)
        return next
      },
      { replace: true },
    )
  }, [isUnknownType, setParams])

  useEffect(() => {
    if (!isUnknownGroup) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('group')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [isUnknownGroup, setParams])

  // A catalog narrowed to a group the universe does not have shows every type again, with the address cleaned in place.
  useEffect(() => {
    if (!isUnknownBrowse) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('browse')
        return next
      },
      { replace: true },
    )
  }, [isUnknownBrowse, setParams])

  // Field filters the chosen type can still answer. One the address carries that it cannot - a field since deleted or
  // changed, an option gone, a hand-edited value - is taken out in place, never read as another filter, and never sent.
  const fieldFilters: FieldFilter[] = selectedType
    ? addressFilters.filter((filter) => isValidFor(filter, selectedType))
    : []
  // A group has no fields of its own, so every field filter in its address is stale too.
  const hasStaleFilters =
    (selectedType !== null || selectedGroup !== null) &&
    fieldFilters.length !== addressFilters.length
  useEffect(() => {
    if (!hasStaleFilters) return
    setParams(
      (current) =>
        withFieldFilters(
          current,
          selectedType
            ? readFieldFilters(current).filter((filter) => isValidFor(filter, selectedType))
            : [],
        ),
      { replace: true },
    )
  }, [hasStaleFilters, selectedType, setParams])
  const fieldFiltersKey = fieldFilters.map(encodeFieldFilter).join('&')

  // Only a type of this universe is ever asked for, and only once the types are known.
  const entityTypeId = selectedType?.id ?? null
  const entityTypeGroupId = selectedGroup?.id ?? null

  useEffect(() => {
    if (entityTypeId === null && entityTypeGroupId === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      listEntities(
        universe.id,
        {
          search,
          entityTypeId,
          entityTypeGroupId,
          includeDescendants: true,
          canonStatus,
          tag: null,
          page,
          pageSize,
          fieldFilters,
        },
        controller.signal,
      )
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ kind: 'error' })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // fieldFilters is read through its key: a fresh array of the same filters is not a new list.
  }, [
    universe.id,
    search,
    entityTypeId,
    entityTypeGroupId,
    canonStatus,
    page,
    pageSize,
    reads,
    fieldFiltersKey,
  ])

  /** The address with these changes, always back on the first page unless a page is given. */
  function changed(from: URLSearchParams, changes: Record<string, string | null>) {
    const next = new URLSearchParams(from)
    next.delete('page')
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    return next
  }

  const withParams = (changes: Record<string, string | null>) => changed(params, changes)

  /** Written against the address as it is when the change lands, not as it was when drawn. React Router hands a
      functional update the last render's params, which a navigation still rendering has moved past: a status chosen
      just after a field filter was applied would write the filter away. */
  const liveParams = () => new URLSearchParams(window.location.search)
  const update = (changes: Record<string, string | null>, replace: boolean) =>
    setParams(changed(liveParams(), changes), { replace })

  /** A page is a move: Back returns to the page before. */
  function goToPage(next: number) {
    update({ page: next > 1 ? String(next) : null }, false)
    window.scrollTo({ top: 0 })
  }

  /** Field filters are a move, like a page: Back undoes one. */
  function setFieldFilters(change: (current: FieldFilter[]) => FieldFilter[]) {
    const live = liveParams()
    const current = selectedType
      ? readFieldFilters(live).filter((filter) => isValidFor(filter, selectedType))
      : []
    setParams(withFieldFilters(live, change(current)))
  }

  // Everything that narrows, gone at once and the scope kept. A move, so Back brings the filters back.
  const searchRef = useRef<HTMLInputElement>(null)
  const clearedSearch = (): To => {
    const next = withParams({ q: null, status: null, [FIELD_FILTER_PARAM]: null }).toString()
    return { search: next ? `?${next}` : '' }
  }

  // Another type is another set of fields: its filters do not travel with the author.
  const hrefFor = (typeId: string | null): To => {
    const next = withParams({
      type: typeId,
      group: null,
      browse: null,
      open: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
    return { search: next ? `?${next}` : '' }
  }

  const typeHref = (typeId: string) => hrefFor(typeId)

  // A group drops the type, and with it the type's field filters.
  const groupHref = (groupId: string): To => {
    const next = withParams({
      group: groupId,
      type: null,
      browse: null,
      open: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
    return { search: `?${next}` }
  }

  // Nothing chosen is nothing read: whatever the last type's read left behind is not shown.
  const view: LoadState =
    entityTypeId === null && entityTypeGroupId === null ? { kind: 'idle' } : state
  const result = view.kind === 'ready' ? view.page : null

  const scope = [location.search, pageSize].join('|')
  const listKey = (() => {
    const next = new URLSearchParams(location.search)
    next.delete('page')
    return next.toString()
  })()
  // Another page, filter, type or size drops the selection for good - coming back does not bring it back either. Set while
  // rendering, the way React adjusts state to a changed input, so no frame ever shows the old selection on the new list.
  if (selection.scope !== scope) setSelection({ scope, ids: new Set() })
  const selectedIds = selection.scope === scope ? selection.ids : new Set<string>()
  const pageItems = result?.items ?? []
  const selected = pageItems.filter((item) => selectedIds.has(item.id))

  function toggle(entityId: string) {
    setSelection(() => {
      const next = new Set(selectedIds)
      if (next.has(entityId)) next.delete(entityId)
      else next.add(entityId)
      return { scope, ids: next }
    })
  }

  function selectPage() {
    setSelection({ scope, ids: new Set(pageItems.map((item) => item.id)) })
  }

  function clearSelection() {
    setSelection({ scope, ids: new Set() })
  }

  function stopSelecting() {
    clearSelection()
    setIsSelecting(false)
  }

  /**
   * Moves what is selected to the Trash, all together or not at all, after one question that says what it means: out of
   * Lore, not erased, restorable. A failure leaves every entry where it was, still selected.
   */
  async function trashSelected() {
    const count = selected.length
    if (trashing.current || count === 0) return

    const noun = count === 1 ? 'entry' : 'entries'
    trashing.current = true
    try {
      const moved = await confirmAction({
        title: `Move ${count} ${noun} to the Trash?`,
        message:
          `${count === 1 ? 'It leaves' : 'They leave'} Lore, search and pickers, but nothing is erased: ` +
          'articles, fields, history and connections are kept, and each one can be restored from the Trash.',
        details:
          count <= 5 ? selected.map((item) => <bdi key={item.id}>{item.name}</bdi>) : undefined,
        confirmLabel: `Move ${count} to Trash`,
        busyLabel: 'Moving…',
        variant: 'warning',
        failure: (error) =>
          `Nothing was moved. ${error instanceof ApiError ? error.message : 'Try again.'}`,
        action: async () => {
          setIsTrashing(true)
          try {
            await bulkTrashEntities(
              universe.id,
              selected.map((item) => item.id),
            )
          } finally {
            setIsTrashing(false)
          }
        },
      })
      if (!moved) return
      setTrashed({ text: `${count} ${noun} moved to the Trash.`, list: listKey })
      stopSelecting()
      setReads((reads) => reads + 1)
    } finally {
      trashing.current = false
    }
  }

  // Said on the list it happened in, and still said when an emptied page falls back to the last one there is.
  const trashedNotice = trashed?.list === listKey ? trashed.text : null

  // A page past the last one - a hand-edited address, or entries gone since - lands on the last page there is, in place.
  const pastTheEnd = result !== null && result.totalPages > 0 && page > result.totalPages
  const lastPage = result?.totalPages ?? 1
  useEffect(() => {
    if (!pastTheEnd) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (lastPage > 1) next.set('page', String(lastPage))
        else next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [pastTheEnd, lastPage, setParams])

  /** A new size is a new way of cutting the list: back to its first page, as a filter change is. */
  function changePageSize(next: number) {
    saveLorePageSize(next)
    setPageSize(next)
    update({}, true)
  }

  // Offered once there is more than the smallest page to cut, or once the author has chosen a size.
  const offerPageSize =
    (result?.totalCount ?? 0) > LORE_PAGE_SIZES[0] || pageSize !== LORE_PAGE_SIZES[0]
  const isFiltered = search.trim().length > 0 || canonStatus !== null || fieldFilters.length > 0
  const activeFilters =
    (search.trim() ? 1 : 0) + (canonStatus !== null ? 1 : 0) + fieldFilters.length
  // Under a group, the member types a field filter could be added from - each a link to that type, search and status kept.
  const fieldTypes = selectedGroup
    ? (types ?? []).filter(
        (type) => selectedGroup.typeIds.includes(type.id) && filterableFields(type).length > 0,
      )
    : []
  const createTo = selectedType ? `new?type=${selectedType.id}` : 'new'
  const massCreateTo = selectedType ? `mass-create?type=${selectedType.id}` : 'mass-create'

  return (
    <article className="lore" data-selecting={isSelecting ? 'true' : undefined}>
      <PageHeader
        crumb={
          selectedNode || selectedGroup ? (
            <span className="lore__path" data-testid="lore-path">
              {/* Lore itself: the catalog, which reads no entry - not every entry. A group's list has it too. */}
              <Link to={hrefFor(null)} data-testid="lore-path-root">
                Lore
              </Link>
              {(selectedNode?.path ?? []).slice(0, -1).map((ancestor) => (
                <Fragment key={ancestor.id}>
                  <span className="lore__pathsep" aria-hidden="true">
                    ›
                  </span>
                  <Link to={hrefFor(ancestor.id)} data-testid="lore-path-type">
                    <bdi>{ancestor.name}</bdi>
                  </Link>
                </Fragment>
              ))}
            </span>
          ) : null
        }
        title={chosenName ? <bdi>{chosenName}</bdi> : 'Lore'}
        lede={
          atCatalog && types !== null && types.length > 0 ? (
            <>
              Every category in <bdi>{universe.name}</bdi>. Open one to browse its entries.
            </>
          ) : undefined
        }
        actions={
          access.editContent ? (
            <>
              {/* Many names at once: beside New, never above it - the everyday way in stays the primary one. */}
              <Link
                className="button button--secondary lore__masscreate"
                to={massCreateTo}
                title="Mass create"
                data-testid="mass-create"
              >
                <ActionIcon icon={ListPlus} />
                <span className="lore__masscreatelabel">Mass create</span>
              </Link>
              <Link
                className="button lore__create"
                to={createTo}
                aria-label={selectedType ? `New ${selectedType.name}` : 'New entry'}
                data-testid="new-entity"
              >
                <ActionIcon icon={Plus} />
                <span className="lore__createlabel">
                  New {selectedType ? <bdi>{selectedType.name}</bdi> : 'entry'}
                </span>
              </Link>
            </>
          ) : undefined
        }
      >
        {/* Navigation only: the types, and on a phone the Filters button beside them. Nothing that comes and goes with the
            list - Select, a page size - shares this row, so the types have the same width whichever type is open and their
            links never move from one row to another as the author goes between a type with entries and one without. On the
            catalog the cards are the navigation, so the row and the groups wait for a choice (Issue #60). */}
        {atCatalog ? null : (
          <>
            <div className="lore__nav">
              <TypeSwitcher
                tree={tree}
                selected={selectedNode}
                hrefFor={typeHref}
                groups={groups ?? []}
                selectedGroupId={selectedGroup?.id ?? null}
                groupHref={groupHref}
              />
              {chosenName ? (
                <button
                  className="button button--secondary lore__filtertoggle"
                  type="button"
                  aria-expanded={filtersOpen}
                  aria-controls={filtersId}
                  onClick={() => setFiltersOpen((open) => !open)}
                  data-testid="lore-filters-toggle"
                >
                  <ActionIcon icon={ListFilter} />
                  Filters
                  {activeFilters > 0 ? (
                    <span className="lore__filtercount">{activeFilters}</span>
                  ) : null}
                </button>
              ) : null}
            </div>
            <GroupSwitcher
              groups={groups ?? []}
              selectedGroupId={selectedGroup?.id ?? null}
              groupHref={groupHref}
            />
          </>
        )}
      </PageHeader>

      {/* The list's own controls, under the navigation: what narrows the list (search and status, folded behind Filters on a
          phone), then what acts on it (the page size and Select), at the row's end. They wait for a type: nothing here can
          widen to the whole universe. Select is offered while there is something on the page to select. */}
      <div className="lore__controls" hidden={!chosenName} data-testid="lore-controls">
        <div
          className="lore__filters"
          id={filtersId}
          role="group"
          aria-label="Filters"
          data-open={filtersOpen ? 'true' : 'false'}
          data-testid="lore-filters"
        >
          <div className="lore__search">
            <label className="visually-hidden" htmlFor="lore-search">
              Filter entries
            </label>
            <ListFilter className="lore__searchicon" aria-hidden="true" focusable="false" />
            <input
              id="lore-search"
              ref={searchRef}
              className="field__input lore__searchinput"
              type="search"
              placeholder={chosenName ? `Search ${chosenName}` : 'Search'}
              title="Searches names, aliases, summaries and articles"
              value={search}
              onChange={(event) => update({ q: event.target.value }, true)}
            />
          </div>

          <div className="segmented" role="group" aria-label="Status">
            <button
              className="segmented__option"
              type="button"
              aria-pressed={canonStatus === null}
              onClick={() => update({ status: null }, true)}
            >
              Any status
            </button>
            {CANON_ORDER.map((status) => (
              <button
                key={status}
                className="segmented__option"
                type="button"
                aria-pressed={canonStatus === status}
                onClick={() => update({ status: String(status) }, true)}
              >
                {CANON_LABELS[status]}
              </button>
            ))}
          </div>

          {selectedType ? (
            <LoreFieldFilters
              universeId={universe.id}
              type={selectedType}
              filters={fieldFilters}
              onChange={setFieldFilters}
            />
          ) : null}

          {/* Offered where the empty state does not offer it already. The focus goes to the search, which stays. */}
          {isFiltered && !(result && result.items.length === 0) ? (
            <Link
              className="button button--text lore__clearfilters"
              to={clearedSearch()}
              onClick={() => searchRef.current?.focus()}
              data-testid="lore-reset-filters"
            >
              <ActionIcon icon={X} />
              Clear filters
            </Link>
          ) : null}

          {selectedGroup && fieldTypes.length > 0 ? (
            <p className="lore__fieldhint" data-testid="lore-group-field-hint">
              To filter by fields, choose one type:{' '}
              {fieldTypes.map((type, index) => (
                <Fragment key={type.id}>
                  {index > 0 ? ', ' : null}
                  <Link to={hrefFor(type.id)} data-testid="lore-group-field-type">
                    <bdi>{type.name}</bdi>
                  </Link>
                </Fragment>
              ))}
              .
            </p>
          ) : null}

          {selectedNode && selectedNode.children.length > 0 && fieldFilters.length > 0 ? (
            <p className="lore__fieldhint" data-testid="lore-branch-field-hint">
              Field filters match <bdi>{selectedNode.type.name}</bdi> entries only. Types filed
              inside it have their own fields.
            </p>
          ) : null}
        </div>

        {offerPageSize || (access.manageTrash && pageItems.length > 0) || isSelecting ? (
          <div className="lore__resultactions" data-testid="lore-result-actions">
            {offerPageSize ? (
              <div className="lore__pagesize">
                <label className="lore__pagesizelabel" htmlFor="lore-page-size">
                  Items per page
                </label>
                <select
                  id="lore-page-size"
                  className="field__input lore__pagesizeselect"
                  value={pageSize}
                  onChange={(event) => changePageSize(Number(event.target.value))}
                  data-testid="lore-page-size"
                >
                  {LORE_PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {access.manageTrash && (pageItems.length > 0 || isSelecting) ? (
              <button
                className="button button--secondary lore__select"
                type="button"
                aria-pressed={isSelecting}
                onClick={() => (isSelecting ? stopSelecting() : setIsSelecting(true))}
                data-testid="lore-select"
              >
                <ActionIcon icon={ListChecks} />
                Select
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {trashedNotice ? (
        <p className="lore__created" role="status" data-testid="lore-trashed">
          <ActionIcon icon={Check} />
          {trashedNotice} <Link to={`/app/universes/${universe.id}/trash`}>Open the Trash</Link>
        </p>
      ) : null}

      {massCreated !== null ? (
        <p className="lore__created" role="status" data-testid="lore-mass-created">
          <ActionIcon icon={Check} />
          Created {massCreated} {massCreated === 1 ? 'entry' : 'entries'}.
        </p>
      ) : null}

      {/* Nothing chosen yet: the catalog of types is the way in (ADR 0065). It reads the types and groups the page already
          has, and no entry. Groups that cannot be read leave the cards without the group choice. */}
      {atCatalog && types !== null && types.length > 0 && groups !== null ? (
        <LoreCatalog
          tree={tree}
          groups={groups}
          browsing={browsing}
          onBrowse={(groupId) => update({ browse: groupId }, true)}
          typeHref={typeHref}
          groupHref={groupHref}
          typesUrl={`/app/universes/${universe.id}/types`}
        />
      ) : null}
      {atCatalog && !typesFailed && (types === null || (types.length > 0 && groups === null)) ? (
        <LoreCatalogSkeleton />
      ) : null}

      {typesFailed ? (
        <div className="notice notice--error" role="alert" data-testid="lore-types-error">
          <p>The categories could not be read.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setTypesFailed(false)
              setTypeReads((count) => count + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {/* No types at all leaves nothing to choose: one line to where types are made, not a panel. */}
      {types !== null && types.length === 0 ? (
        <p className="notice" data-testid="lore-no-types">
          This universe has no types yet.{' '}
          <Link to={`/app/universes/${universe.id}/types`}>Add one on Types</Link>.
        </p>
      ) : null}

      {view.kind === 'loading' ? (
        <div className="lore__loading">
          <p className="visually-hidden" role="status">
            Reading the archive…
          </p>
          <ul className="cardgrid lore__skeleton" aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li className="skeletoncard" key={index}>
                <span className="skeleton skeletoncard__tile" />
                <span className="skeletoncard__lines">
                  <span className="skeleton skeletoncard__line" />
                  <span className="skeleton skeletoncard__line skeletoncard__line--short" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="lore-load-error">
          <p>The lore could not be read.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((count) => count + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {chosenName && result && result.items.length > 0 ? (
        <ul className="cardgrid lore__grid" data-testid="entity-grid">
          {result.items.map((entity) => (
            <li key={entity.id}>
              <EntityCard
                universeId={universe.id}
                entity={entity}
                selection={
                  isSelecting
                    ? { checked: selectedIds.has(entity.id), onToggle: () => toggle(entity.id) }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      {chosenName && result && result.items.length === 0 && isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title="Nothing matches that."
          hint={
            chosenName ? (
              <>
                No <bdi>{chosenName}</bdi> entry matches these filters.
              </>
            ) : (
              'No entry matches these filters.'
            )
          }
          action={
            <Link
              className="button button--secondary"
              to={clearedSearch()}
              data-testid="lore-clear-filters"
            >
              Clear filters
            </Link>
          }
        />
      ) : null}

      {selectedGroup && result && result.items.length === 0 && !isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title="Nothing in this group yet."
          hint={
            selectedGroup.typeIds.length === 0 ? (
              <>
                No type is in <bdi>{selectedGroup.name}</bdi> yet. Add types to it from their
                settings on <Link to={`/app/universes/${universe.id}/types`}>Types</Link>.
              </>
            ) : (
              <>
                None of the types in <bdi>{selectedGroup.name}</bdi> has an entry yet.
              </>
            )
          }
        />
      ) : null}

      {selectedType && result && result.items.length === 0 && !isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title="No entries in this category yet."
          hint={
            selectedNode && selectedNode.children.length > 0 ? (
              <>
                Nothing is filed under <bdi>{selectedType.name}</bdi> or anything inside it. Write
                the first one, and the rest will have something to point at.
              </>
            ) : (
              <>
                Nothing is filed under <bdi>{selectedType.name}</bdi> yet. Write the first one, and
                the rest will have something to point at.
              </>
            )
          }
          action={
            access.editContent ? (
              <Link className="button" to={createTo} data-testid="empty-new-entity">
                <ActionIcon icon={Plus} />
                New {selectedType ? <bdi>{selectedType.name}</bdi> : 'entry'}
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {chosenName && result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            <ActionIcon icon={ArrowLeft} />
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={page >= result.totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Next
            <ActionIcon icon={ArrowRight} />
          </button>
        </nav>
      ) : null}

      {isSelecting ? (
        <footer className="actionbar lore__selectbar" data-testid="lore-selectbar">
          <p className="actionbar__status" role="status" data-testid="lore-selected-count">
            {selected.length === 0
              ? 'Select entries on this page to move them to the Trash.'
              : `${selected.length} selected`}
          </p>
          <div className="actionbar__actions">
            <button
              className="button"
              type="button"
              onClick={() => void trashSelected()}
              disabled={selected.length === 0 || isTrashing}
              aria-busy={isTrashing || undefined}
              data-testid="lore-trash-selected"
            >
              <ActionIcon icon={Trash2} />
              {isTrashing
                ? 'Moving…'
                : selected.length > 0
                  ? `Move ${selected.length} to Trash`
                  : 'Move to Trash'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="lore-select-page"
            >
              Select page
            </button>
            <button
              className="button button--text"
              type="button"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="lore-clear-selection"
            >
              Clear selection
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={stopSelecting}
              data-testid="lore-select-done"
            >
              Done
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  )
}
