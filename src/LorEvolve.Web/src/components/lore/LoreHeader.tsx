import { ListFilter, ListPlus } from 'lucide-react'
import { Crumb } from '../Crumb'
import { PageHeader } from '../PageHeader'
import { GroupSwitcher, TypeSwitcher } from '../TypeSwitcher'
import { useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

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
          <Crumb
            testId="lore-path"
            items={[
              // Lore itself: the catalog, which reads no entry - not every entry. A group's list has it too.
              { to: hrefFor(null), label: t('lore.page.pathRoot'), testId: 'lore-path-root' },
              ...(selectedNode?.path ?? []).slice(0, -1).map((ancestor) => ({
                to: hrefFor(ancestor.id),
                label: <bdi>{ancestor.name}</bdi>,
                testId: 'lore-path-type',
              })),
            ]}
          />
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
            <Button
              tone="secondary"
              icon={ListPlus}
              className="lore__masscreate"
              to={massCreateTo}
              title={t('lore.page.massCreateTitle')}
              data-testid="mass-create"
            >
              <span className="lore__masscreatelabel">{t('lore.page.massCreateLabel')}</span>
            </Button>
            <NewButton
              className="lore__create"
              to={createTo}
              aria-label={
                selectedType
                  ? t('lore.page.newTypeLabel', { name: selectedType.name })
                  : t('lore.page.newEntry')
              }
              data-testid="new-entity"
            >
              <span className="lore__createlabel">
                {selectedType
                  ? tx('lore.page.newType', { type: <bdi>{selectedType.name}</bdi> })
                  : t('lore.page.newEntry')}
              </span>
            </NewButton>
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
              <Button
                tone="secondary"
                icon={ListFilter}
                className="lore__filtertoggle"
                aria-expanded={filtersOpen}
                aria-controls={filtersId}
                onClick={() => setFiltersOpen((open) => !open)}
                data-testid="lore-filters-toggle"
              >
                {t('lore.page.filters')}
                {activeFilters > 0 ? (
                  <span className="lore__filtercount">{activeFilters}</span>
                ) : null}
              </Button>
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
