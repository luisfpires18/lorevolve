import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ListFilter, X } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { LoreFieldFilters } from '../LoreFieldFilters'
import { useI18n } from '../../i18n'
import { CANON_LABELS, CANON_ORDER, type CanonStatusValue, type EntityPage } from '../../lore/types'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { EntityType } from '../../lore/typeDefinitions'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'

type Entries = ReturnType<typeof useLoreEntries>
type Links = ReturnType<typeof useLoreLinks>

/** What narrows the list: the search, the status, Clear filters and the field filters. */
export function LoreControls({
  filtersOpen,
  selectedType,
  selectedGroup,
  chosenName,
  fieldFilters,
  update,
  setFieldFilters,
  searchRef,
  clearedSearch,
  hrefFor,
  universe,
  filtersId,
  canonStatus,
  search,
  exact,
  result,
  isFiltered,
  fieldTypes,
}: {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  filtersId: string
  canonStatus: CanonStatusValue | null
  search: string
  exact: boolean
  result: EntityPage | null
  isFiltered: boolean
  fieldTypes: EntityType[]
} & Pick<
  Entries,
  'filtersOpen' | 'selectedType' | 'selectedGroup' | 'chosenName' | 'fieldFilters'
> &
  Pick<Links, 'update' | 'setFieldFilters' | 'searchRef' | 'clearedSearch' | 'hrefFor'>) {
  const { t, tx } = useI18n()
  return (
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
            chosenName ? t('lore.page.searchNamed', { name: chosenName }) : t('lore.page.search')
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
  )
}
