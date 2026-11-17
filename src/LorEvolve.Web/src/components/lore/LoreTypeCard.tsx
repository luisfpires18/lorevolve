import { useId } from 'react'
import { Link, type To } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { branchIds, type TreeType, type TypeNode } from '../../lore/typeTree'
import { TypeIcon } from '../TypeIcon'

/**
 * What a card reads of a type. A lore type has it as it is; a project's own type (#144) is the same card, its entry count
 * read as `listedEntityCount`, so a game's Entities screen is this catalog rather than a second one.
 */
export type CatalogType = TreeType & {
  description: string | null
  icon: string | null
  accentColor: string | null
  listedEntityCount: number
}

/**
 * The entries a type's card counts: what the type's list shows when the card is opened - its own and those of every type
 * nested beneath it, neither in the Trash nor archived. Summed from each type's `listedEntityCount`, which the universe's
 * types list already carries, so no card makes a request of its own.
 */
export function listedEntries(
  node: TypeNode<CatalogType>,
  byId: Map<string, TypeNode<CatalogType>>,
) {
  let count = 0
  for (const id of branchIds(node)) count += byId.get(id)?.type.listedEntityCount ?? 0
  return count
}

export function TypeCard({
  node,
  count,
  href,
}: {
  node: TypeNode<CatalogType>
  count: number
  href: To
}) {
  const { t, tn, tx } = useI18n()
  const nameId = useId()
  const detailsId = useId()
  const { type } = node
  const entries =
    count === 0 ? t('lore.catalog.noEntries') : tn('lore.catalog.entries', count, { n: count })
  const above = node.path.slice(0, -1)
  const nested = node.children.length
  return (
    <Link
      className="typecard"
      to={href}
      aria-labelledby={nameId}
      aria-describedby={detailsId}
      style={type.accentColor ? { ['--type-accent' as string]: type.accentColor } : undefined}
      data-testid="lore-type-card"
      data-type-name={type.name}
    >
      <span className="typecard__icon">
        <TypeIcon iconKey={type.icon} />
      </span>
      <span className="typecard__body">
        {/* A long name is cut after two lines on the card; the whole of it is the link's name and its tooltip. */}
        <span className="typecard__name" id={nameId} title={type.name}>
          <bdi>{type.name}</bdi>
        </span>
        <span className="typecard__details" id={detailsId}>
          {above.length > 0 ? (
            <span className="typecard__path">
              {tx('lore.catalog.inPath', {
                path: <bdi>{above.map((ancestor) => ancestor.name).join(' › ')}</bdi>,
              })}
            </span>
          ) : null}
          {type.description ? (
            <span className="typecard__description">
              <bdi>{type.description}</bdi>
            </span>
          ) : null}
          <span className="typecard__meta" data-testid="lore-type-card-count">
            {nested > 0
              ? t('lore.catalog.entriesWithNested', {
                  entries: entries,
                  nested: tn('lore.catalog.nestedTypes', nested, { n: nested }),
                })
              : entries}
          </span>
        </span>
      </span>
    </Link>
  )
}
