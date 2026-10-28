import { Link } from 'react-router-dom'
import { EntityTile } from './EntityTile'
import { NameList } from './NameList'
import { StatusBadge } from './StatusBadge'
import { TypeIcon } from './TypeIcon'
import { CANON_LABELS, type EntitySummary } from '../lore/types'

/**
 * A Lore card: what the entry looks like, what it is called, what kind of thing it is and how
 * settled it is - then, if it has one, two lines of its summary. Nothing else earns the space: tags
 * stay on the entry, and the card is not a small copy of the entry page.
 *
 * The whole card is one link, so there is nothing interactive inside it. Its accessible name is
 * the entry's name first; the picture beside it is decorative.
 */
export function EntityCard({
  universeId,
  entity,
  selection,
}: {
  universeId: string
  entity: EntitySummary
  /**
   * While Lore is selecting, the card is not a link: it is the label of its own checkbox, so pressing anywhere on it -
   * or Space on the box - selects it, and the box says whether it is.
   */
  selection?: { checked: boolean; onToggle: () => void }
}) {
  const body = <CardBody universeId={universeId} entity={entity} />

  if (selection) {
    return (
      <label
        className="entitycard entitycard--selectable"
        data-selected={selection.checked ? 'true' : undefined}
        data-testid="entity-card"
        data-entity-name={entity.name}
      >
        <input
          className="entitycard__check"
          type="checkbox"
          checked={selection.checked}
          onChange={selection.onToggle}
          aria-label={`Select ${entity.name}`}
          data-testid="entity-select"
        />
        {body}
      </label>
    )
  }

  return (
    <Link
      className="entitycard"
      to={`/app/universes/${universeId}/lore/${entity.id}`}
      data-testid="entity-card"
      data-entity-name={entity.name}
    >
      {body}
    </Link>
  )
}

function CardBody({ universeId, entity }: { universeId: string; entity: EntitySummary }) {
  return (
    <>
      <EntityTile
        className="entitycard__tile"
        universeId={universeId}
        entityId={entity.id}
        image={entity.image}
        typeIcon={entity.entityTypeIcon}
        typeAccent={entity.entityTypeAccentColor}
      />

      <span className="entitycard__body">
        <span className="entitycard__name">
          <bdi>{entity.name}</bdi>
        </span>

        {entity.aliases.length > 0 ? (
          <span className="entitycard__aliases">
            also <NameList names={entity.aliases} />
          </span>
        ) : null}

        <span className="entitycard__meta">
          <span
            className="entitycard__type"
            title={entity.entityTypeName}
            style={
              entity.entityTypeAccentColor
                ? { ['--type-accent' as string]: entity.entityTypeAccentColor }
                : undefined
            }
          >
            <TypeIcon iconKey={entity.entityTypeIcon} className="entitycard__typeicon" />
            {/* Its own direction on the element that cuts it, so a right-to-left name loses its end, not its start. */}
            <span className="entitycard__typename" dir="auto">
              {entity.entityTypeName}
            </span>
          </span>
          <StatusBadge
            className="entitycard__status"
            step={entity.canonStatus}
            label={CANON_LABELS[entity.canonStatus]}
          />
        </span>

        {/* Why a search found it, when the article is where: plain runs of text, the matched words marked. */}
        {entity.articleExcerpt ? (
          <span className="entitycard__excerpt" data-testid="entity-excerpt">
            <span className="entitycard__excerptlabel">In the article</span>
            <span className="entitycard__summary prose">
              {entity.articleExcerpt.map((part, index) =>
                part.isMatch ? (
                  <mark key={index}>{part.text}</mark>
                ) : (
                  <span key={index}>{part.text}</span>
                ),
              )}
            </span>
          </span>
        ) : entity.summary ? (
          <span className="entitycard__summary prose">{entity.summary}</span>
        ) : null}
      </span>
    </>
  )
}
