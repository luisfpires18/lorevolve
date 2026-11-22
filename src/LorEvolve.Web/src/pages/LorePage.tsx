import { useEffect, useId, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { LoreCatalog, LoreCatalogSkeleton } from '../components/LoreCatalog'
import { LORE_PAGE_SIZES, saveLorePageSize } from '../lore/api'
import { filterableFields, readFieldFilters } from '../lore/fieldFilters'
import type { MassCreatedState } from './MassCreatePage'
import { useUniverseAccess } from '../universes/access'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { readPage, readSort, readStatus } from '../lore/loreAddress'
import { useLoreEntries } from '../lore/useLoreEntries'
import { useLoreLinks } from '../lore/useLoreLinks'
import { useLoreSelection } from '../lore/useLoreSelection'
import { LoreHeader } from '../components/lore/LoreHeader'
import { LoreControls } from '../components/lore/LoreControls'
import { LoreResultActions } from '../components/lore/LoreResultActions'
import { LoreStatus } from '../components/lore/LoreStatus'
import { LoreResults } from '../components/lore/LoreResults'
import { LoreSelectBar } from '../components/lore/LoreSelectBar'
import type { LoadState } from '../lore/loreAddress'
import { pageParam } from '../lib/queryParams'
import { useEntrySource } from '../lore/entrySource'

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
  const { universe, entryTypes: typesRead, groups: groupsRead, refreshTypes } = useWorkspaceTypes()
  const entrySource = useEntrySource()
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

  const entries = useLoreEntries({
    typesRead,
    groupsRead,
    setParams,
    typeParam,
    groupParam,
    browseParam,
    canonStatus,
    search,
    exact,
    sort,
    page,
    addressFilters,
  })
  const {
    types,
    typesFailed,
    groups,
    state,
    reread,
    pageSize,
    setPageSize,
    tree,
    selectedType,
    selectedGroup,
    chosenName,
    atCatalog,
    browsing,
    fieldFilters,
    entityTypeId,
    entityTypeGroupId,
  } = entries
  const links = useLoreLinks({ params, setParams, selectedType })
  const { update, typeHref, groupHref } = links

  // Nothing chosen is nothing read: whatever the last type's read left behind is not shown.
  const view: LoadState =
    entityTypeId === null && entityTypeGroupId === null ? { kind: 'idle' } : state
  const result = view.kind === 'ready' ? view.value : null

  const entrySelection = useLoreSelection({ location, pageSize, result, universe, reread })
  const { isSelecting } = entrySelection

  // A page past the last one - a hand-edited address, or entries gone since - lands on the last page there is, in place.
  const pastTheEnd = result !== null && result.totalPages > 0 && page > result.totalPages
  const lastPage = result?.totalPages ?? 1
  useEffect(() => {
    if (!pastTheEnd) return
    setParams((current) => pageParam(current, 'page', lastPage), { replace: true })
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
  const createTo = entrySource.href.create(selectedType?.id)
  const massCreateTo = selectedType ? `mass-create?type=${selectedType.id}` : 'mass-create'

  return (
    <article className="lore" data-selecting={isSelecting ? 'true' : undefined}>
      <LoreHeader
        {...entries}
        {...links}
        universe={universe}
        access={access}
        filtersId={filtersId}
        activeFilters={activeFilters}
        createTo={createTo}
        massCreateTo={massCreateTo}
      />

      {/* The list's own controls, under the navigation: what narrows the list (search and status, folded behind Filters on a
          phone), then what acts on it (the page size and Select), at the row's end. They wait for a type: nothing here can
          widen to the whole universe. Select is offered while there is something on the page to select. */}
      <div className="lore__controls" hidden={!chosenName} data-testid="lore-controls">
        <LoreControls
          {...entries}
          {...links}
          universe={universe}
          filtersId={filtersId}
          canonStatus={canonStatus}
          search={search}
          exact={exact}
          result={result}
          isFiltered={isFiltered}
          fieldTypes={fieldTypes}
        />

        <LoreResultActions
          {...entries}
          {...links}
          {...entrySelection}
          access={access}
          sort={sort}
          result={result}
          changePageSize={changePageSize}
          offerPageSize={offerPageSize}
          ranked={ranked}
        />
      </div>

      <LoreStatus
        {...entries}
        {...entrySelection}
        massCreated={massCreated}
        refreshTypes={refreshTypes}
        view={view}
      >
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
            typesUrl={entrySource.href.types}
          />
        ) : null}
        {atCatalog && !typesFailed && (types === null || (types.length > 0 && groups === null)) ? (
          <LoreCatalogSkeleton />
        ) : null}
      </LoreStatus>

      <LoreResults
        {...entries}
        {...links}
        {...entrySelection}
        universe={universe}
        access={access}
        result={result}
        isFiltered={isFiltered}
        createTo={createTo}
      />

      <LoreSelectBar {...entrySelection} />
    </article>
  )
}
