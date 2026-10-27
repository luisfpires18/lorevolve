import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { EntityTile } from './EntityTile'
import { TypeIcon } from './TypeIcon'
import type { SceneLoreReference } from '../stories/types'

/**
 * A lore reference as a story draws it, on a scene or on a plot beat: its type's icon - or, for a point of view,
 * its square tile - and its name, a real link to the entry's own page. An entry in the Trash is named but not linked,
 * because it has no page to open while it is there.
 */
export function LoreReference({
  universeId,
  reference,
  portrait = false,
}: {
  universeId: string
  reference: SceneLoreReference
  portrait?: boolean
}) {
  const className = `lorechip${portrait ? ' lorechip--pov' : ''}`
  const accent = reference.entityTypeAccentColor
    ? ({ '--type-accent': reference.entityTypeAccentColor } as CSSProperties)
    : undefined

  const content = (
    <>
      {portrait ? (
        <EntityTile
          className="lorechip__tile"
          universeId={universeId}
          entityId={reference.entityId}
          // A trashed entry's picture is not served, so it is drawn as its type's tile instead.
          image={reference.isTrashed ? null : reference.image}
          typeIcon={reference.entityTypeIcon}
          typeAccent={reference.entityTypeAccentColor}
        />
      ) : (
        <TypeIcon iconKey={reference.entityTypeIcon} className="lorechip__icon" />
      )}
      <span className="lorechip__name">
        <bdi>{reference.name}</bdi>
      </span>
    </>
  )

  if (reference.isTrashed) {
    return (
      <span
        className={`${className} lorechip--trashed`}
        style={accent}
        data-testid="lore-reference-trashed"
      >
        {content} <span className="lorechip__note">(in Trash)</span>
      </span>
    )
  }

  return (
    <Link
      className={className}
      style={accent}
      to={`/app/universes/${universeId}/lore/${reference.entityId}`}
      title={reference.entityTypeName}
      data-testid="lore-reference"
    >
      {content}
    </Link>
  )
}
