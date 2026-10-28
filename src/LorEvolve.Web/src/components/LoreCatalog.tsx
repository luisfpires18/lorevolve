import { useId, useState } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import type { EntityTypeGroup } from '../lore/types'
import { branchIds, type TypeNode, type TypeTree } from '../lore/typeTree'
import { TypeIcon } from './TypeIcon'

/** How many card shapes stand in for the catalog while the types are read. */
const SKELETON_CARDS = 6

/**
 * The entries a type's card counts: what the type's list shows when the card is opened - its own and those of every type
 * nested beneath it, neither in the Trash nor archived. Summed from each type's `listedEntityCount`, which the universe's
 * types list already carries, so no card makes a request of its own.
 */
function listedEntries(node: TypeNode, byId: Map<string, TypeNode>) {
  let count = 0
  for (const id of branchIds(node)) count += byId.get(id)?.type.listedEntityCount ?? 0
  return count
}

function entriesLabel(count: number) {
  return count === 0 ? 'No entries yet' : count === 1 ? '1 entry' : `${count} entries`
}

function TypeCard({ node, count, href }: { node: TypeNode; count: number; href: To }) {
  const nameId = useId()
  const detailsId = useId()
  const { type } = node
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
              In <bdi>{above.map((ancestor) => ancestor.name).join(' › ')}</bdi>
            </span>
          ) : null}
          {type.description ? (
            <span className="typecard__description">
              <bdi>{type.description}</bdi>
            </span>
          ) : null}
          <span className="typecard__meta" data-testid="lore-type-card-count">
            {entriesLabel(count)}
            {nested > 0 ? ` · ${nested === 1 ? '1 nested type' : `${nested} nested types`}` : null}
          </span>
        </span>
      </span>
    </Link>
  )
}

/**
 * Lore's front page (Issue #60): every type of the universe as a card, in the hierarchy's order, and above them a small
 * "Browse by group" choice that narrows the cards to a group's member types. A card opens the type's own list - the same
 * `?type=<id>` the type row has always linked to - so everything about that list is unchanged. The group choice is the
 * address's `browse` and replaces the entry it is on, so Back from a type returns to the cards as they were narrowed. A
 * group stays a group: membership is read as it is, a type in two groups is under both, a type in none is under All
 * types, and the group's own entry list (`?group=<id>`) is one link away.
 */
export function LoreCatalog({
  tree,
  groups,
  browsing,
  onBrowse,
  typeHref,
  groupHref,
  typesUrl,
}: {
  tree: TypeTree
  groups: EntityTypeGroup[]
  /** The group the cards are narrowed to, or null for every type. */
  browsing: EntityTypeGroup | null
  onBrowse: (groupId: string | null) => void
  typeHref: (typeId: string) => To
  groupHref: (groupId: string) => To
  typesUrl: string
}) {
  const headingId = useId()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const members = browsing ? new Set(browsing.typeIds) : null
  // A group is read as it is, flat. All types starts at the top of the hierarchy: a type's nested types follow it once
  // it is expanded, each card naming where it sits.
  const shown = members
    ? tree.ordered.filter((node) => members.has(node.type.id))
    : tree.ordered.filter((node) => node.path.slice(0, -1).every((above) => expanded.has(above.id)))

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="lorecatalog" aria-labelledby={headingId} data-testid="lore-catalog">
      <h2 className="visually-hidden" id={headingId}>
        Categories
      </h2>

      {groups.length > 0 ? (
        <div className="lorecatalog__browse">
          <span className="lorecatalog__browselabel" aria-hidden="true">
            Browse by group
          </span>
          <div
            className="lorecatalog__groups"
            role="group"
            aria-label="Browse by group"
            data-testid="lore-browse-groups"
          >
            <button
              className="lorecatalog__group"
              type="button"
              aria-pressed={browsing === null}
              onClick={() => onBrowse(null)}
              data-testid="lore-browse-all"
            >
              All types
              <span className="lorecatalog__groupcount" aria-hidden="true">
                {tree.ordered.length}
              </span>
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                className="lorecatalog__group"
                type="button"
                aria-pressed={browsing?.id === group.id}
                onClick={() => onBrowse(group.id)}
                data-testid="lore-browse-group"
                data-group-name={group.name}
              >
                <Layers className="lorecatalog__groupicon" aria-hidden="true" focusable="false" />
                <bdi>{group.name}</bdi>
                <span className="visually-hidden"> (group)</span>
                <span className="lorecatalog__groupcount" aria-hidden="true">
                  {group.typeIds.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="lorecatalog__status" role="status" data-testid="lore-catalog-status">
        {browsing ? (
          <>
            {shown.length === 0 ? (
              <>
                No type is in <bdi>{browsing.name}</bdi> yet. Add types to it from their settings on{' '}
                <Link to={typesUrl}>Types</Link>.
              </>
            ) : (
              <>
                {shown.length === 1 ? '1 type' : `${shown.length} types`} in{' '}
                <bdi>{browsing.name}</bdi>.{' '}
                <Link to={groupHref(browsing.id)} data-testid="lore-browse-group-entries">
                  Browse every <bdi>{browsing.name}</bdi> entry
                </Link>
              </>
            )}
          </>
        ) : (
          <span className="visually-hidden">
            {shown.length === 1 ? '1 type' : `${shown.length} types`}
          </span>
        )}
      </p>

      {shown.length > 0 ? (
        <ul className="lorecatalog__grid" data-testid="lore-type-cards">
          {shown.map((node) => {
            const isOpen = expanded.has(node.type.id)
            const Chevron = isOpen ? ChevronDown : ChevronRight
            return (
              <li
                key={node.type.id}
                className={node.path.length > 1 ? 'lorecatalog__nestedcard' : undefined}
              >
                <TypeCard
                  node={node}
                  count={listedEntries(node, tree.byId)}
                  href={typeHref(node.type.id)}
                />
                {!members && node.children.length > 0 ? (
                  <button
                    className="button button--text button--sm lorecatalog__expand"
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(node.type.id)}
                    data-testid="lore-type-expand"
                    data-type-name={node.type.name}
                  >
                    <Chevron aria-hidden="true" focusable="false" />
                    {isOpen ? 'Hide' : 'Show'}{' '}
                    {node.children.length === 1
                      ? '1 nested type'
                      : `${node.children.length} nested types`}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

/** The catalog's shape while the types are read: card outlines, said once to assistive technology. */
export function LoreCatalogSkeleton() {
  return (
    <div className="lorecatalog" data-testid="lore-catalog-loading">
      <p className="visually-hidden" role="status">
        Reading the categories…
      </p>
      <ul className="lorecatalog__grid" aria-hidden="true">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li className="typecard typecard--skeleton" key={index}>
            <span className="skeleton typecard__icon" />
            <span className="typecard__body">
              <span className="skeleton skeletoncard__line" />
              <span className="skeleton skeletoncard__line skeletoncard__line--short" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
