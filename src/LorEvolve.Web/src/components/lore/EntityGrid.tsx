import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react'
import { CardGrid } from '../CardGrid'
import { EntityCard, type CardEntity } from '../EntityCard'

type CardProps = Omit<ComponentProps<typeof EntityCard>, 'universeId' | 'entity'>
type ItemProps = ComponentPropsWithRef<'li'> & { 'data-testid'?: string }

/**
 * Entry cards in the Lore grid: one `li` per entry holding its `EntityCard`, then `extra` under the card.
 * The Lore list draws through it, for a Lore or a project source (#551). Catalogue: docs/design/ui-components.md.
 */
export function EntityGrid<T extends CardEntity>({
  universeId,
  items,
  testId,
  card,
  item,
  extra,
}: {
  universeId: string
  items: readonly T[]
  testId: string
  /** The card's own props for one entry (`eager`, `selection`, `href`, `linkTestId`, `note`, `actions`). */
  card?: (entity: T, index: number) => CardProps
  /** Attributes on the entry's `li`: a test id, `aria-current`, a ref. */
  item?: (entity: T) => ItemProps
  /** What sits under the card, inside its `li`. */
  extra?: (entity: T) => ReactNode
}) {
  return (
    <CardGrid className="lore__grid" testId={testId}>
      {items.map((entity, index) => (
        <li key={entity.id} {...item?.(entity)}>
          <EntityCard universeId={universeId} entity={entity} {...card?.(entity, index)} />
          {extra?.(entity)}
        </li>
      ))}
    </CardGrid>
  )
}
