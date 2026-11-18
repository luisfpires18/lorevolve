import { ListFilter, X } from 'lucide-react'
import type { ProjectEntityType } from '../../projectEntities/types'
import { buildTypeTree } from '../../lore/typeTree'
import { t, useI18n } from '../../i18n'
import type { useProjectEntriesRead } from '../../projectEntities/useProjectEntriesRead'
import type { useProjectEntriesState } from '../../projectEntities/useProjectEntriesState'
import { Button } from '../Button'

/** Search, sort, nested and Clear for one type's entries. */
export function ProjectEntriesFilters({
  sort,
  nested,
  filtered,
  searchText,
  setSearchText,
  types,
  typeId,
  setFilter,
  clearFilters,
  type,
}: Pick<
  ReturnType<typeof useProjectEntriesState>,
  'sort' | 'nested' | 'filtered' | 'searchText' | 'setSearchText' | 'typeId'
> &
  Pick<ReturnType<typeof useProjectEntriesRead>, 'setFilter' | 'clearFilters'> & {
    types: ProjectEntityType[]
    type: ProjectEntityType | null
  }) {
  useI18n()

  return (
    <>
      {typeId !== null ? (
        <div className="projects__filters" role="group" aria-label={t('lore.page.filtersGroup')}>
          <div className="lore__search">
            <label className="visually-hidden" htmlFor="project-entries-search">
              {t('lore.page.filterEntries')}
            </label>
            <ListFilter
              className="lore__searchicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <input
              id="project-entries-search"
              className="field__input lore__searchinput"
              type="search"
              placeholder={t('projects.entries.searchPlaceholder')}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              data-testid="project-entries-search"
            />
          </div>
          <div className="lore__pagesize">
            <label className="lore__pagesizelabel" htmlFor="project-entries-sort">
              {t('lore.page.sortBy')}
            </label>
            <select
              id="project-entries-sort"
              className="field__input lore__pagesizeselect"
              value={sort}
              onChange={(event) => setFilter({ sort: event.target.value || null })}
              data-testid="project-entries-sort"
            >
              <option value="">{t('lore.page.sortName')}</option>
              <option value="updated">{t('lore.page.sortUpdated')}</option>
              <option value="created">{t('lore.page.sortCreated')}</option>
            </select>
          </div>
          {type && buildTypeTree(types).byId.get(type.id)?.children.length ? (
            <label className="check">
              <input
                type="checkbox"
                checked={nested}
                onChange={(event) => setFilter({ nested: event.target.checked ? '1' : null })}
                data-testid="project-entries-nested"
              />
              <span>{t('projects.entries.nested')}</span>
            </label>
          ) : null}
          {filtered ? (
            <Button tone="text" icon={X} onClick={clearFilters} data-testid="project-entries-clear">
              {t('lore.page.clearFilters')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
