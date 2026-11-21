import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { worldPath, type PublicUniverse } from '../../portal/api'

/** A public reading page's way back: the world it belongs to, then where the reader is. */
export function PublicCrumbs({
  world,
  label,
  current,
  testId,
}: {
  world: PublicUniverse
  /** The nav's accessible name. */
  label: string
  current: string
  /** The back link's test id. */
  testId: string
}) {
  return (
    <nav className="pcrumbs" aria-label={label}>
      <ol>
        <li>
          <Link className="pcrumbs__back" to={worldPath(world.slug)} data-testid={testId}>
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
            <bdi>{world.name}</bdi>
          </Link>
        </li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  )
}
