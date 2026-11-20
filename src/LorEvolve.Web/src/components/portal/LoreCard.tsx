import { Link } from 'react-router-dom'
import { monogram } from '../../lib/monogram'
import { lorePath, type PublicLoreEntry } from '../../portal/api'

export function LoreCard({ world, entry }: { world: string; entry: PublicLoreEntry }) {
  return (
    <li className="plorecard">
      <Link className="plorecard__link" to={lorePath(world, entry.slug)}>
        <span className="plorecard__thumb" aria-hidden="true">
          {entry.thumbnailUrl ? (
            <img
              src={entry.thumbnailUrl}
              alt=""
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="plorecard__initial">{monogram(entry.name, '·')}</span>
          )}
        </span>
        <span className="plorecard__text">
          <span className="plorecard__type">{entry.typeName}</span>
          <span className="plorecard__name" dir="auto">
            <bdi>{entry.name}</bdi>
          </span>
          {entry.summary ? (
            <span className="plorecard__summary" dir="auto">
              {entry.summary}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}
