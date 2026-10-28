import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { formatDate } from '../lib/dates'
import { ROLE_LABELS } from '../universes/access'
import { artworkUrl } from '../publishing/api'
import { UniverseRole, type UniverseSummary } from '../universes/types'

/**
 * An entrance into a world: its artwork across the head of the card, a spine in the universe's own colour, the name
 * set in the display face, and nothing invented. No counts, no fake activity.
 *
 * The artwork is the owner's card cut, named by the ids the list row carries, so the picture is in the card's first
 * render rather than asked for after it. The API sends them only for a universe the account owns (a collaborator's role
 * cannot read the artwork, ADR 0041). Without one - a world not yet given artwork, or one shared with you - the head is
 * the world's own colour as a dusk, with its initial set large and faint: plainly not a picture.
 *
 * A universe someone else owns says so quietly at its foot - "Shared · Editor" - in the meta line's own small muted type,
 * never beside the name. One the account owns carries no badge: owning is the ordinary case.
 */
export function UniverseCard({ universe }: { universe: UniverseSummary }) {
  const artwork = universe.artwork ? artworkUrl(universe.id, universe.artwork, 'card') : null

  return (
    <Link
      className="plate"
      to={`/app/universes/${universe.id}`}
      style={
        universe.accentColor ? { ['--plate-accent' as string]: universe.accentColor } : undefined
      }
      data-testid="universe-card"
      data-universe-name={universe.name}
    >
      {/* The initial is drawn by CSS from the attribute, so it is never part of the card's text. */}
      <span
        className="plate__art"
        aria-hidden="true"
        data-initial={artwork ? undefined : (Array.from(universe.name.trim())[0] ?? '')}
      >
        {artwork ? (
          <img
            className="plate__image"
            src={artwork}
            alt=""
            width={960}
            height={600}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>
      <span className="plate__spine" aria-hidden="true" />
      <span className="plate__body">
        <span className="plate__name">
          <bdi>{universe.name}</bdi>
        </span>
        {universe.description ? (
          <span className="plate__description prose">{universe.description}</span>
        ) : (
          <span className="plate__description plate__description--empty">No description yet</span>
        )}
        <span className="plate__meta">
          <span className="plate__updated">
            <Clock
              className="plate__clock"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            Updated {formatDate(universe.updatedAt)}
          </span>
          {universe.accessRole !== UniverseRole.Owner || universe.isArchived ? (
            <span className="plate__marks">
              {universe.accessRole !== UniverseRole.Owner ? (
                <span className="plate__role" data-testid="universe-card-role">
                  Shared · {ROLE_LABELS[universe.accessRole]}
                </span>
              ) : null}
              {universe.isArchived ? <span className="plate__archived">Archived</span> : null}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  )
}
