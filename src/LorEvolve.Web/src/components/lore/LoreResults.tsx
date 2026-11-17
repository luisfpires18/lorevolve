import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { EmptyState } from '../EmptyState'
import { EntityCard } from '../EntityCard'
import { useI18n } from '../../i18n'
import type { EntityPage } from '../../lore/types'
import { useUniverseAccess } from '../../universes/access'
import { useWorkspaceTypes } from '../../pages/useWorkspaceTypes'
import type { useLoreEntries } from '../../lore/useLoreEntries'
import type { useLoreLinks } from '../../lore/useLoreLinks'
import type { useLoreSelection } from '../../lore/useLoreSelection'

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
  page,
  result,
  isFiltered,
  createTo,
}: {
  universe: ReturnType<typeof useWorkspaceTypes>['universe']
  access: ReturnType<typeof useUniverseAccess>
  page: number
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
    </>
  )
}
