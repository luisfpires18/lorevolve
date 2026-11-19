import { Link } from 'react-router-dom'
import { Pager } from '../Pager'
import { EmptyState } from '../EmptyState'
import { EntityCard } from '../EntityCard'
import { useI18n } from '../../i18n'
import type { EntityPage } from '../../lore/types'
import { useUniverseAccess } from '../../universes/access'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'
import type { useLoreSelection } from '../../lore/useLoreSelection'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

type Entries = ReturnType<typeof useLoreEntries>
type Links = ReturnType<typeof useLoreLinks>
type Selection = ReturnType<typeof useLoreSelection>

/** The entries found, the empty states and the pager. */
export function LoreResults({
  selectedNode,
  selectedType,
  selectedGroup,
  chosenName,
  goToPage,
  clearedSearch,
  isSelecting,
  selectedIds,
  toggle,
  universe,
  access,
  result,
  isFiltered,
  createTo,
}: {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  access: ReturnType<typeof useUniverseAccess>
  result: EntityPage | null
  isFiltered: boolean
  createTo: string
} & Pick<Entries, 'selectedNode' | 'selectedType' | 'selectedGroup' | 'chosenName'> &
  Pick<Links, 'goToPage' | 'clearedSearch'> &
  Pick<Selection, 'isSelecting' | 'selectedIds' | 'toggle'>) {
  const { t, tx } = useI18n()
  return (
    <>
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
            <Button tone="secondary" to={clearedSearch()} data-testid="lore-clear-filters">
              {t('lore.page.clearFiltersEmpty')}
            </Button>
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
              <NewButton to={createTo} data-testid="empty-new-entity">
                {tx('lore.page.emptyNewType', { type: <bdi>{selectedType.name}</bdi> })}
              </NewButton>
            ) : undefined
          }
        />
      ) : null}

      {chosenName && result ? (
        <Pager page={result.page} totalPages={result.totalPages} onPage={goToPage} />
      ) : null}
    </>
  )
}
