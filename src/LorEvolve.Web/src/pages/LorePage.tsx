import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams, type To } from 'react-router-dom'
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
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import {
  LORE_PAGE_SIZES,
  bulkTrashEntities,
  listEntities,
  readLorePageSize,
  saveLorePageSize,
} from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  type CanonStatusValue,
  type EntityPage,
  type EntitySort,
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
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { confirmAction } from '../lib/confirm'

type LoadState =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; page: EntityPage } | { kind: 'error' }

/** How many card shapes stand in for the first page while it is read. */
const SKELETON_CARDS = 6

/** Groups that could not be read: none to offer, one stable list. */
const EMPTY_GROUPS: EntityTypeGroup[] = []

function readStatus(value: string | null): CanonStatusValue | null {
  return value === '0' || value === '1' || value === '2'
    ? (Number(value) as CanonStatusValue)
    : null
}

function readSort(value: string | null): EntitySort | null {
  return value === 'updated' || value === 'name' || value === 'created' ? value : null
}

function readPage(value: string | null) {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The Lore browser. Where the author is - which type, which status, what is typed in the filter, which of the type's own
 * fields narrow it, which page - is the address and nothing else:
 * `lore?type=<id>&status=<0|1|2>&q=<text>&exact=1&sort=<updated|name|created>&field=<id>:<op>:<value>&page=<n>`
 * (`field` once per filter, 034).
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
  const { t, tn, tx } = useI18n()
  const { universe, entryTypes: typesRead, groups: groupsRead, refreshTypes } = useWorkspaceTypes()
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
  const exact = params.get('exact') === '1'
  const sort = readSort(params.get('sort'))
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

  // The types and groups come with the universe (`useWorkspaceTypes`). A failed read of the types is not a universe without
  // any: `types` stays unknown, so nothing below reads the failure as "no types" or takes a chosen type out of the address
  // as one that does not exist (#58).
  const types = Array.isArray(typesRead) ? typesRead : null
  const typesFailed = typesRead === 'failed'
  // Groups are a second way in, not a requirement: if they cannot be read, Lore is browsed by type alone.
  const groups = groupsRead === 'failed' ? EMPTY_GROUPS : groupsRead
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Entries per page: the author's own preference in this browser, never in the address - a link someone shares opens at
  // their reader's size, not the sender's.
  const [pageSize, setPageSize] = useState(readLorePageSize)

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

  // The search text the last read was asked for. Only a change of it waits for typing to pause; the first read and a
  // type, page, sort or filter change go out at once.
  const searchRead = useRef<string | null>(null)

  useEffect(() => {
    if (entityTypeId === null && entityTypeGroupId === null) return
    const delay = searchRead.current !== null && searchRead.current !== search ? 150 : 0
    searchRead.current = search
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
          exact,
          sort,
        },
        controller.signal,
      )
        .then((result) => setState({ kind: 'ready', page: result }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ kind: 'error' })
        })
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // fieldFilters is read through its key: a fresh array of the same filters is not a new list.
  }, [
    universe.id,
    search,
    exact,
    sort,
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
    const next = withParams({
      q: null,
      exact: null,
      status: null,
      [FIELD_FILTER_PARAM]: null,
    }).toString()
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

    trashing.current = true
    try {
      const moved = await confirmAction({
        title: tn('lore.page.trash.title', count, { n: count }),
        message: tn('lore.page.trash.message', count),
        details:
          count <= 5 ? selected.map((item) => <bdi key={item.id}>{item.name}</bdi>) : undefined,
        confirmLabel: t('lore.page.trash.confirm', { n: count }),
        busyLabel: t('lore.page.trash.busy'),
        variant: 'warning',
        failure: (error) =>
          t('lore.page.trash.failure', {
            reason: error instanceof ApiError ? error.message : t('lore.page.trash.tryAgain'),
          }),
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
      setTrashed({ text: tn('lore.page.trash.moved', count, { n: count }), list: listKey })
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
  // A search that is not exact is read best match first, unless another order is chosen.
  const ranked = search.trim().length > 0 && !exact
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
                {t('lore.page.pathRoot')}
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
        title={chosenName ? <bdi>{chosenName}</bdi> : t('lore.page.title')}
        lede={
          atCatalog && types !== null && types.length > 0
            ? tx('lore.page.lede', { universe: <bdi>{universe.name}</bdi> })
            : undefined
        }
        actions={
          access.editContent ? (
            <>
              {/* Many names at once: beside New, never above it - the everyday way in stays the primary one. */}
              <Link
                className="button button--secondary lore__masscreate"
                to={massCreateTo}
                title={t('lore.page.massCreateTitle')}
                data-testid="mass-create"
              >
                <ActionIcon icon={ListPlus} />
                <span className="lore__masscreatelabel">{t('lore.page.massCreateLabel')}</span>
              </Link>
              <Link
                className="button lore__create"
                to={createTo}
                aria-label={
                  selectedType
                    ? t('lore.page.newTypeLabel', { name: selectedType.name })
                    : t('lore.page.newEntry')
                }
                data-testid="new-entity"
              >
                <ActionIcon icon={Plus} />
                <span className="lore__createlabel">
                  {selectedType
                    ? tx('lore.page.newType', { type: <bdi>{selectedType.name}</bdi> })
                    : t('lore.page.newEntry')}
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
                  {t('lore.page.filters')}
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
          aria-label={t('lore.page.filtersGroup')}
          data-open={filtersOpen ? 'true' : 'false'}
          data-testid="lore-filters"
        >
          <div className="lore__search">
            <label className="visually-hidden" htmlFor="lore-search">
              {t('lore.page.filterEntries')}
            </label>
            <ListFilter
              className="lore__searchicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <input
              id="lore-search"
              ref={searchRef}
              className="field__input lore__searchinput"
              type="search"
              placeholder={
                chosenName
                  ? t('lore.page.searchNamed', { name: chosenName })
                  : t('lore.page.search')
              }
              title={t('lore.page.searchHelp')}
              value={search}
              onChange={(event) => update({ q: event.target.value }, true)}
            />
            <button
              className="lore__exact"
              type="button"
              aria-pressed={exact}
              title={t('lore.page.exactHelp')}
              onClick={() => update({ exact: exact ? null : '1', page: null }, true)}
              data-testid="lore-exact"
            >
              {t('lore.page.exact')}
            </button>
          </div>

          <div className="segmented" role="group" aria-label={t('lore.page.status')}>
            <button
              className="segmented__option"
              type="button"
              aria-pressed={canonStatus === null}
              onClick={() => update({ status: null }, true)}
            >
              {t('lore.page.anyStatus')}
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
              {t('lore.page.clearFilters')}
            </Link>
          ) : null}

          {selectedGroup && fieldTypes.length > 0 ? (
            <p className="lore__fieldhint" data-testid="lore-group-field-hint">
              {tx('lore.page.groupFieldHint', {
                types: fieldTypes.map((type, index) => (
                  <Fragment key={type.id}>
                    {index > 0 ? ', ' : null}
                    <Link to={hrefFor(type.id)} data-testid="lore-group-field-type">
                      <bdi>{type.name}</bdi>
                    </Link>
                  </Fragment>
                )),
              })}
            </p>
          ) : null}
        </div>

        {chosenName ? (
          <div className="lore__resultactions" data-testid="lore-result-actions">
            <div className="lore__pagesize">
              <label className="lore__pagesizelabel" htmlFor="lore-sort">
                {t('lore.page.sortBy')}
              </label>
              <select
                id="lore-sort"
                className="field__input lore__pagesizeselect"
                value={sort ?? ''}
                onChange={(event) => update({ sort: event.target.value || null, page: null }, true)}
                data-testid="lore-sort"
              >
                <option value="">
                  {ranked ? t('lore.page.sortBest') : t('lore.page.sortUpdated')}
                </option>
                {ranked ? <option value="updated">{t('lore.page.sortUpdated')}</option> : null}
                <option value="name">{t('lore.page.sortName')}</option>
                <option value="created">{t('lore.page.sortCreated')}</option>
              </select>
            </div>
            {offerPageSize ? (
              <div className="lore__pagesize">
                <label className="lore__pagesizelabel" htmlFor="lore-page-size">
                  {t('lore.page.perPage')}
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
                {t('lore.page.select')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {trashedNotice ? (
        <p className="lore__created" role="status" data-testid="lore-trashed">
          <ActionIcon icon={Check} />
          {trashedNotice}{' '}
          <Link to={`/app/universes/${universe.id}/trash`}>{t('lore.page.openTrash')}</Link>
        </p>
      ) : null}

      {massCreated !== null ? (
        <p className="lore__created" role="status" data-testid="lore-mass-created">
          <ActionIcon icon={Check} />
          {tn('lore.page.created', massCreated, { n: massCreated })}
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
          <p>{t('lore.page.typesFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              refreshTypes().catch(() => undefined)
            }}
          >
            {t('lore.page.retryTypes')}
          </button>
        </div>
      ) : null}

      {/* No types at all leaves nothing to choose: one line to where types are made, not a panel. */}
      {types !== null && types.length === 0 ? (
        <p className="notice" data-testid="lore-no-types">
          {tx('lore.page.noTypes', {
            link: (
              <Link to={`/app/universes/${universe.id}/types`}>{t('lore.page.noTypesLink')}</Link>
            ),
          })}
        </p>
      ) : null}

      {view.kind === 'loading' ? (
        <div className="lore__loading">
          <p className="visually-hidden" role="status">
            {t('lore.page.reading')}
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
          <p>{t('lore.page.loadFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((count) => count + 1)
            }}
          >
            {t('lore.page.retryLore')}
          </button>
        </div>
      ) : null}

      {chosenName && result && result.items.length > 0 ? (
        <ul className="cardgrid lore__grid" data-testid="entity-grid">
          {result.items.map((entity, index) => (
            <li key={entity.id}>
              <EntityCard
                eager={index < 8}
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
          title={t('lore.page.noMatchTitle')}
          hint={
            chosenName
              ? tx('lore.page.noMatchNamed', { name: <bdi>{chosenName}</bdi> })
              : t('lore.page.noMatch')
          }
          action={
            <Link
              className="button button--secondary"
              to={clearedSearch()}
              data-testid="lore-clear-filters"
            >
              {t('lore.page.clearFiltersEmpty')}
            </Link>
          }
        />
      ) : null}

      {selectedGroup && result && result.items.length === 0 && !isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title={t('lore.page.emptyGroupTitle')}
          hint={
            selectedGroup.typeIds.length === 0
              ? tx('lore.page.emptyGroupNoTypes', {
                  name: <bdi>{selectedGroup.name}</bdi>,
                  link: (
                    <Link to={`/app/universes/${universe.id}/types`}>
                      {t('lore.page.emptyGroupTypesLink')}
                    </Link>
                  ),
                })
              : tx('lore.page.emptyGroupNoEntries', { name: <bdi>{selectedGroup.name}</bdi> })
          }
        />
      ) : null}

      {selectedType && result && result.items.length === 0 && !isFiltered ? (
        <EmptyState
          testId="entity-empty"
          title={t('lore.page.emptyTypeTitle')}
          hint={
            selectedNode && selectedNode.children.length > 0
              ? tx('lore.page.emptyTypeNested', { name: <bdi>{selectedType.name}</bdi> })
              : tx('lore.page.emptyType', { name: <bdi>{selectedType.name}</bdi> })
          }
          action={
            access.editContent ? (
              <Link className="button" to={createTo} data-testid="empty-new-entity">
                <ActionIcon icon={Plus} />
                {tx('lore.page.emptyNewType', { type: <bdi>{selectedType.name}</bdi> })}
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {chosenName && result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('lore.page.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            <ActionIcon icon={ArrowLeft} />
            {t('lore.page.previous')}
          </button>
          <span className="pager__position">
            {t('lore.page.pageOf', { page: result.page, total: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={page >= result.totalPages}
            onClick={() => goToPage(page + 1)}
          >
            {t('lore.page.next')}
            <ActionIcon icon={ArrowRight} />
          </button>
        </nav>
      ) : null}

      {isSelecting ? (
        <footer className="actionbar lore__selectbar" data-testid="lore-selectbar">
          <p className="actionbar__status" role="status" data-testid="lore-selected-count">
            {selected.length === 0
              ? t('lore.page.selectHint')
              : t('lore.page.selected', { n: selected.length })}
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
                ? t('lore.page.moving')
                : selected.length > 0
                  ? t('lore.page.moveSelected', { n: selected.length })
                  : t('lore.page.moveToTrash')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={selectPage}
              disabled={pageItems.length === 0 || selected.length === pageItems.length}
              data-testid="lore-select-page"
            >
              {t('lore.page.selectPage')}
            </button>
            <button
              className="button button--text"
              type="button"
              onClick={clearSelection}
              disabled={selected.length === 0}
              data-testid="lore-clear-selection"
            >
              {t('lore.page.clearSelection')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={stopSelecting}
              data-testid="lore-select-done"
            >
              {t('lore.page.done')}
            </button>
          </div>
        </footer>
      ) : null}
    </article>
  )
}
