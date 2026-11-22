import { useId } from 'react'
import { Link, useSearchParams, type To } from 'react-router-dom'
import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useI18n } from '../i18n'
import type { EntityTypeGroup } from '../lore/typeDefinitions'
import type { TypeTree } from '../lore/typeTree'
import { listedEntries, TypeCard, type CatalogType } from './lore/LoreTypeCard'
import { Button } from './Button'
import { CardGrid } from './CardGrid'
import { CardSkeleton } from './CardSkeleton'
import { QuietNote } from './QuietNote'
import { ViewChips } from './ViewChips'

/** How many card shapes stand in for the catalog while the types are read. */
const SKELETON_CARDS = 6

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
  tree: TypeTree<CatalogType>
  groups: EntityTypeGroup[]
  /** The group the cards are narrowed to, or null for every type. */
  browsing: EntityTypeGroup | null
  onBrowse: (groupId: string | null) => void
  typeHref: (typeId: string) => To
  groupHref: (groupId: string) => To
  typesUrl: string
}) {
  const { t, tn, tx } = useI18n()
  const headingId = useId()
  // The unfolded types are the address's `open`, replacing its entry, so Back from a type finds them still open.
  const [params, setParams] = useSearchParams()
  const expanded = new Set((params.get('open') ?? '').split(',').filter(Boolean))
  const members = browsing ? new Set(browsing.typeIds) : null
  // A group is read as it is, flat. All types starts at the top of the hierarchy: a type's nested types follow it once
  // it is expanded, each card naming where it sits.
  const shown = members
    ? tree.ordered.filter((node) => members.has(node.type.id))
    : tree.ordered.filter((node) => node.path.slice(0, -1).every((above) => expanded.has(above.id)))

  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        if (next.size === 0) copy.delete('open')
        else copy.set('open', [...next].join(','))
        return copy
      },
      { replace: true },
    )
  }

  return (
    <section className="stack stack--4" aria-labelledby={headingId} data-testid="lore-catalog">
      <h2 className="visually-hidden" id={headingId}>
        {t('lore.catalog.heading')}
      </h2>

      {groups.length > 0 ? (
        <div className="lorecatalog__browse">
          <span className="lorecatalog__browselabel" aria-hidden="true">
            {t('lore.catalog.browseLabel')}
          </span>
          <ViewChips
            label={t('lore.catalog.browseGroups')}
            testId="lore-browse-groups"
            items={[
              {
                pressed: browsing === null,
                onSelect: () => onBrowse(null),
                label: t('lore.catalog.allTypes'),
                count: tree.ordered.length,
                testId: 'lore-browse-all',
              },
              ...groups.map((group) => ({
                pressed: browsing?.id === group.id,
                onSelect: () => onBrowse(group.id),
                label: <bdi>{group.name}</bdi>,
                icon: Layers,
                hiddenSuffix: t('lore.catalog.groupSuffix'),
                count: group.typeIds.length,
                testId: 'lore-browse-group',
                data: { 'data-group-name': group.name },
              })),
            ]}
          />
        </div>
      ) : null}

      <QuietNote
        className="lorecatalog__status"
        size="ui"
        testId="lore-catalog-status"
        role="status"
      >
        {browsing ? (
          <>
            {shown.length === 0 ? (
              <>
                {tx('lore.catalog.emptyGroup', {
                  name: <bdi>{browsing.name}</bdi>,
                  link: <Link to={typesUrl}>{t('lore.catalog.typesLink')}</Link>,
                })}
              </>
            ) : (
              <>
                {tx('lore.catalog.groupSummary', {
                  types: tn('lore.catalog.types', shown.length, { n: shown.length }),
                  name: <bdi>{browsing.name}</bdi>,
                  link: (
                    <Link to={groupHref(browsing.id)} data-testid="lore-browse-group-entries">
                      {tx('lore.catalog.browseEvery', { name: <bdi>{browsing.name}</bdi> })}
                    </Link>
                  ),
                })}
              </>
            )}
          </>
        ) : (
          <span className="visually-hidden">
            {tn('lore.catalog.types', shown.length, { n: shown.length })}
          </span>
        )}
      </QuietNote>

      {shown.length > 0 ? (
        <CardGrid min={16} className="lorecatalog__grid" testId="lore-type-cards">
          {shown.map((node) => {
            const isOpen = expanded.has(node.type.id)
            const Chevron = isOpen ? ChevronDown : ChevronRight
            const expandable = !members && node.children.length > 0
            const classes = [
              node.path.length > 1 ? 'lorecatalog__nestedcard' : null,
              expandable ? 'lorecatalog__expandable' : null,
            ].filter(Boolean)
            return (
              <li key={node.type.id} className={classes.length > 0 ? classes.join(' ') : undefined}>
                <TypeCard
                  node={node}
                  count={listedEntries(node, tree.byId)}
                  href={typeHref(node.type.id)}
                />
                {/* Inside the card's lower corner, beside the link rather than in it: a button can't sit in a link. */}
                {expandable ? (
                  <Button
                    tone="text"
                    size="sm"
                    className="lorecatalog__expand"
                    aria-expanded={isOpen}
                    onClick={() => toggle(node.type.id)}
                    data-testid="lore-type-expand"
                    data-type-name={node.type.name}
                    aria-label={tn(
                      isOpen ? 'lore.catalog.hideNested' : 'lore.catalog.showNested',
                      node.children.length,
                      { n: node.children.length },
                    )}
                    title={
                      isOpen ? t('lore.catalog.hideNestedTitle') : t('lore.catalog.showNestedTitle')
                    }
                  >
                    <Chevron aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    <span aria-hidden="true">{node.children.length}</span>
                  </Button>
                ) : null}
              </li>
            )
          })}
        </CardGrid>
      ) : null}
    </section>
  )
}

/** The catalog's shape while the types are read: card outlines, said once to assistive technology. */
export function LoreCatalogSkeleton() {
  const { t } = useI18n()
  return (
    <div className="stack stack--4" data-testid="lore-catalog-loading">
      <CardSkeleton
        shape="icon"
        min={16}
        className="lorecatalog__grid"
        count={SKELETON_CARDS}
        announce={t('lore.catalog.reading')}
      />
    </div>
  )
}
