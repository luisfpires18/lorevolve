import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { LoreFieldFilters } from '../LoreFieldFilters'
import { useI18n } from '../../i18n'
import type { CanonStatusValue, EntityPage } from '../../lore/types'
import { CanonStatusPicker } from '../CanonStatusPicker'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { EntityType } from '../../lore/typeDefinitions'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'
import { Button } from '../Button'
import { SearchField } from '../SearchField'

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
      <SearchField
        hideLabel
        className="lore__search"
        id="lore-search"
        label={t('lore.page.filterEntries')}
        inputRef={searchRef}
        placeholder={
          chosenName ? t('lore.page.searchNamed', { name: chosenName }) : t('lore.page.search')
        }
        title={t('lore.page.searchHelp')}
        value={search}
        onChange={(value) => update({ q: value }, true)}
        trailing={
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
        }
        testId="lore-search"
      />

      <CanonStatusPicker
        label={t('lore.page.status')}
        allLabel={t('lore.page.anyStatus')}
        value={canonStatus}
        onChange={(status) => update({ status: status === null ? null : String(status) }, true)}
      />

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
        <Button
          tone="text"
          icon={X}
          className="lore__clearfilters"
          to={clearedSearch()}
          onClick={() => searchRef.current?.focus()}
          data-testid="lore-reset-filters"
        >
          {t('lore.page.clearFilters')}
        </Button>
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
