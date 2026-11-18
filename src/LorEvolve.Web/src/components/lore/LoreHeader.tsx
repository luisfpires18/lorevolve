import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ListFilter, ListPlus, Plus } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { PageHeader } from '../PageHeader'
import { GroupSwitcher, TypeSwitcher } from '../TypeSwitcher'
import { useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'

type Entries = ReturnType<typeof useLoreEntries>
type Links = ReturnType<typeof useLoreLinks>

/** The page header: the crumb, the title, Create and Mass create, and the type and group navigation. */
export function LoreHeader({
  types,
  groups,
  filtersOpen,
  setFiltersOpen,
  tree,
  selectedNode,
  selectedType,
  selectedGroup,
  chosenName,
  atCatalog,
  hrefFor,
  typeHref,
  groupHref,
  universe,
  access,
  filtersId,
  activeFilters,
  createTo,
  massCreateTo,
}: {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  access: ReturnType<typeof useUniverseAccess>
  filtersId: string
  activeFilters: number
  createTo: string
  massCreateTo: string
} & Pick<
  Entries,
  | 'types'
  | 'groups'
  | 'filtersOpen'
  | 'setFiltersOpen'
  | 'tree'
  | 'selectedNode'
  | 'selectedType'
  | 'selectedGroup'
  | 'chosenName'
  | 'atCatalog'
> &
  Pick<Links, 'hrefFor' | 'typeHref' | 'groupHref'>) {
  const { t, tx } = useI18n()
  return (
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
  )
}
